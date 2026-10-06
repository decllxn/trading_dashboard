import asyncio
import logging
import threading
import time
from typing import Dict, Any, List, Optional, Callable
from twisted.internet import reactor, defer
from ctrader_open_api import Client, TcpProtocol, EndPoints, Protobuf
from config import CTRADER_CLIENT_ID, CTRADER_CLIENT_SECRET, CTRADER_ENVIRONMENT

logger = logging.getLogger("ctrader.client")

class CTraderClientManager:
    def __init__(self):
        self.host = EndPoints.PROTOBUF_LIVE_HOST if CTRADER_ENVIRONMENT == "live" else EndPoints.PROTOBUF_DEMO_HOST
        self.port = EndPoints.PROTOBUF_PORT
        self.client: Optional[Client] = None
        self._reactor_thread: Optional[threading.Thread] = None
        self._is_connected = False
        self._app_authorized = False
        self._app_auth_error: Optional[str] = None

        # Caches
        self.authorized_accounts: set[int] = set()
        self.symbol_cache: Dict[int, Dict[int, str]] = {}  # account_id -> {symbol_id -> symbol_name}
        self.asset_cache: Dict[int, Dict[int, str]] = {}   # account_id -> {asset_id -> asset_name}
        self.trader_cache: Dict[int, Dict[str, Any]] = {}  # account_id -> trader data

        # SSE Subscribers (asyncio queues)
        self.subscribers: List[asyncio.Queue] = []
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def start(self, loop: asyncio.AbstractEventLoop):
        """Starts Twisted reactor in a background daemon thread and connects to cTrader."""
        self._loop = loop
        if not reactor.running:
            self._reactor_thread = threading.Thread(target=self._run_reactor, daemon=True, name="TwistedReactor")
            self._reactor_thread.start()
            logger.info("Twisted reactor thread started.")
            time.sleep(0.3)

        reactor.callFromThread(self._init_connection)

    def _run_reactor(self):
        try:
            reactor.run(installSignalHandlers=False)
        except Exception as e:
            logger.error("Reactor crashed: %s", e)

    def _init_connection(self):
        logger.info("Initializing cTrader connection to %s:%s...", self.host, self.port)
        self.client = Client(self.host, self.port, TcpProtocol)
        self.client.setConnectedCallback(self._on_connected)
        self.client.setDisconnectedCallback(self._on_disconnected)
        self.client.setMessageReceivedCallback(self._on_message_received)
        self.client.startService()

    def _on_connected(self, client):
        logger.info("Connected to cTrader backend at %s:%s", self.host, self.port)
        self._is_connected = True
        self._send_app_auth()

    def _on_disconnected(self, client, reason):
        logger.warning("Disconnected from cTrader: %s", reason)
        self._is_connected = False
        self._app_authorized = False
        self.authorized_accounts.clear()

    def _send_app_auth(self):
        logger.info("Sending ProtoOAApplicationAuthReq...")
        req = Protobuf.get(
            "ProtoOAApplicationAuthReq",
            clientId=CTRADER_CLIENT_ID,
            clientSecret=CTRADER_CLIENT_SECRET,
        )
        d = self.client.send(req)
        d.addCallback(self._on_app_auth_res)
        d.addErrback(self._on_app_auth_err)

    def _on_app_auth_res(self, res):
        payload = Protobuf.extract(res)
        logger.info("App Auth Response: %s", payload)
        if hasattr(payload, "errorCode") and payload.errorCode:
            self._app_authorized = False
            self._app_auth_error = f"{payload.errorCode}: {getattr(payload, 'description', '')}"
            logger.error("App authorization rejected: %s", self._app_auth_error)
            if payload.errorCode == "CH_CLIENT_AUTH_FAILURE":
                logger.warning(
                    "cTrader Open API client is not active yet (status pending in portal). "
                    "Stopping aggressive reconnect loop. Will retry in 60 seconds."
                )
                if self.client and self.client.running:
                    self.client.stopService()
                reactor.callLater(60.0, self._retry_connection)
        else:
            self._app_authorized = True
            self._app_auth_error = None
            logger.info("Application authorized successfully with cTrader Open API!")

    def _retry_connection(self):
        logger.info("Retrying cTrader connection check...")
        if self.client:
            self.client.startService()

    def _on_app_auth_err(self, failure):
        logger.error("App Auth network/protocol error: %s", failure)
        self._app_authorized = False
        self._app_auth_error = str(failure)

    def _on_message_received(self, client, message):
        """Dispatches incoming server events (e.g. ProtoOAExecutionEvent, ProtoOATraderUpdatedEvent)."""
        try:
            payload = Protobuf.extract(message)
            msg_name = type(payload).__name__

            if msg_name == "ProtoOAExecutionEvent":
                self._handle_execution_event(payload)
            elif msg_name == "ProtoOATraderUpdatedEvent":
                self._handle_trader_updated_event(payload)
            elif msg_name not in ["ProtoHeartbeatEvent", "ProtoOAApplicationAuthRes", "ProtoOAAccountAuthRes"]:
                logger.debug("Received event: %s", msg_name)
        except Exception as e:
            logger.debug("Non-protobuf or unrecognized message: %s", e)

    def _broadcast_event(self, event_type: str, data: Dict[str, Any]):
        """Pushes an event to all connected SSE clients."""
        if not self._loop:
            return
        payload = {"type": event_type, "data": data, "timestamp": time.time()}
        for q in list(self.subscribers):
            self._loop.call_soon_threadsafe(q.put_nowait, payload)

    def _handle_execution_event(self, payload):
        """Processes live trade execution (fill, close, sl/tp trigger)."""
        account_id = getattr(payload, "ctidTraderAccountId", 0)
        logger.info("Received ProtoOAExecutionEvent for account %s", account_id)

        event_data: Dict[str, Any] = {
            "accountId": account_id,
            "executionType": getattr(payload, "executionType", None),
        }

        # Check for position
        if payload.HasField("position"):
            pos = payload.position
            symbol_name = self._get_symbol_name(account_id, pos.tradeData.symbolId)
            event_data["position"] = {
                "positionId": pos.positionId,
                "symbol": symbol_name,
                "direction": "long" if pos.tradeData.tradeSide == 1 else "short",
                "volume": pos.tradeData.volume / 100.0,
                "entryPrice": pos.price,
                "stopLoss": pos.stopLoss if pos.HasField("stopLoss") else None,
                "takeProfit": pos.takeProfit if pos.HasField("takeProfit") else None,
                "status": "open" if pos.positionStatus == 1 else "closed",
                "swap": pos.swap / 100.0 if pos.HasField("swap") else 0,
                "commission": pos.commission / 100.0 if pos.HasField("commission") else 0,
            }

        # Check for deal (closed trade details)
        if payload.HasField("deal"):
            deal = payload.deal
            symbol_name = self._get_symbol_name(account_id, deal.symbolId)
            money_digits = getattr(deal, "moneyDigits", 2)
            divisor = 10 ** money_digits
            deal_data: Dict[str, Any] = {
                "dealId": deal.dealId,
                "positionId": deal.positionId,
                "symbol": symbol_name,
                "volume": deal.volume / 100.0,
                "executionPrice": deal.executionPrice,
                "tradeSide": "BUY" if deal.tradeSide == 1 else "SELL",
                "executionTime": deal.executionTimestamp,
            }
            if deal.HasField("closePositionDetail"):
                cpd = deal.closePositionDetail
                deal_data["closed"] = True
                deal_data["entryPrice"] = cpd.entryPrice
                deal_data["grossProfit"] = cpd.grossProfit / divisor
                deal_data["swap"] = cpd.swap / divisor
                deal_data["commission"] = cpd.commission / divisor
                deal_data["balance"] = cpd.balance / divisor
            event_data["deal"] = deal_data

        self._broadcast_event("trade:execution", event_data)

    def _handle_trader_updated_event(self, payload):
        """Processes balance/equity changes pushed by the server."""
        account_id = getattr(payload, "ctidTraderAccountId", 0)
        trader = payload.trader
        money_digits = getattr(trader, "moneyDigits", 2)
        divisor = 10 ** money_digits

        balance = trader.balance / divisor
        data = {
            "accountId": account_id,
            "balance": balance,
            "login": trader.traderLogin,
            "leverageInCents": trader.leverageInCents,
        }
        self.trader_cache[account_id] = data
        self._broadcast_event("balance:updated", data)

    def _get_symbol_name(self, account_id: int, symbol_id: int) -> str:
        return self.symbol_cache.get(account_id, {}).get(symbol_id, f"SYM_{symbol_id}")

    # =========================================================================
    # Async API for FastAPI endpoints
    # =========================================================================

    async def _send_async(self, req_proto, timeout: float = 10.0) -> Any:
        """Sends a request through the Twisted client and awaits the response as an asyncio Future."""
        if not self._is_connected or not self.client:
            raise RuntimeError("Not connected to cTrader server.")

        loop = asyncio.get_running_loop()
        future = loop.create_future()

        def in_twisted():
            try:
                d = self.client.send(req_proto, responseTimeoutInSeconds=timeout)
                d.addCallback(lambda res: loop.call_soon_threadsafe(self._resolve_future, future, res))
                d.addErrback(lambda fail: loop.call_soon_threadsafe(self._reject_future, future, fail))
            except Exception as e:
                loop.call_soon_threadsafe(future.set_exception, e)

        reactor.callFromThread(in_twisted)
        return await future

    def _resolve_future(self, future: asyncio.Future, res):
        if not future.done():
            payload = Protobuf.extract(res)
            future.set_result(payload)

    def _reject_future(self, future: asyncio.Future, fail):
        if not future.done():
            future.set_exception(Exception(str(fail)))

    async def get_accounts_by_token(self, access_token: str) -> List[Dict[str, Any]]:
        """Discovers all trading accounts associated with the provided access token."""
        req = Protobuf.get("ProtoOAGetAccountListByAccessTokenReq", accessToken=access_token)
        res = await self._send_async(req)
        accounts = []
        for acct in res.ctidTraderAccount:
            accounts.append({
                "ctidTraderAccountId": acct.ctidTraderAccountId,
                "isLive": acct.isLive,
                "traderLogin": getattr(acct, "traderLogin", None),
                "lastClosingDealTimestamp": getattr(acct, "lastClosingDealTimestamp", None),
            })
        return accounts

    async def authorize_account(self, ctid_trader_account_id: int, access_token: str) -> bool:
        """Authorizes a specific trading account on the active socket connection."""
        req = Protobuf.get(
            "ProtoOAAccountAuthReq",
            ctidTraderAccountId=ctid_trader_account_id,
            accessToken=access_token,
        )
        res = await self._send_async(req)
        if hasattr(res, "errorCode") and res.errorCode:
            logger.error("Account auth failed: %s", res.errorCode)
            return False
        self.authorized_accounts.add(ctid_trader_account_id)
        # Pre-fetch symbols and assets
        asyncio.create_task(self.load_symbols(ctid_trader_account_id))
        return True

    async def load_symbols(self, ctid_trader_account_id: int):
        """Loads and caches the symbol table (symbolId -> symbolName) for an account."""
        try:
            req = Protobuf.get("ProtoOASymbolsListReq", ctidTraderAccountId=ctid_trader_account_id)
            res = await self._send_async(req)
            mapping = {}
            for sym in res.symbol:
                mapping[sym.symbolId] = sym.symbolName
            self.symbol_cache[ctid_trader_account_id] = mapping
            logger.info("Loaded %s symbols for account %s", len(mapping), ctid_trader_account_id)
        except Exception as e:
            logger.warning("Could not load symbols for account %s: %s", ctid_trader_account_id, e)

    async def get_trader_profile(self, ctid_trader_account_id: int) -> Dict[str, Any]:
        """Fetches account balance, leverage, and trader metadata."""
        req = Protobuf.get("ProtoOATraderReq", ctidTraderAccountId=ctid_trader_account_id)
        res = await self._send_async(req)
        trader = res.trader
        money_digits = getattr(trader, "moneyDigits", 2)
        divisor = 10 ** money_digits
        profile = {
            "ctidTraderAccountId": trader.ctidTraderAccountId,
            "balance": trader.balance / divisor,
            "login": trader.traderLogin,
            "brokerName": trader.brokerName,
            "leverage": trader.leverageInCents / 100.0 if trader.HasField("leverageInCents") else 100,
            "depositAssetId": trader.depositAssetId,
        }
        self.trader_cache[ctid_trader_account_id] = profile
        return profile

    async def get_open_positions(self, ctid_trader_account_id: int) -> List[Dict[str, Any]]:
        """Reconciles and returns all active open positions."""
        req = Protobuf.get("ProtoOAReconcileReq", ctidTraderAccountId=ctid_trader_account_id)
        res = await self._send_async(req)
        positions = []
        for pos in res.position:
            symbol_name = self._get_symbol_name(ctid_trader_account_id, pos.tradeData.symbolId)
            money_digits = getattr(pos, "moneyDigits", 2)
            divisor = 10 ** money_digits
            positions.append({
                "positionId": str(pos.positionId),
                "symbol": symbol_name,
                "direction": "long" if pos.tradeData.tradeSide == 1 else "short",
                "volume": pos.tradeData.volume / 100.0,
                "entryPrice": pos.price,
                "stopLoss": pos.stopLoss if pos.HasField("stopLoss") else None,
                "takeProfit": pos.takeProfit if pos.HasField("takeProfit") else None,
                "openTime": pos.tradeData.openTimestamp,
                "swap": pos.swap / divisor if pos.HasField("swap") else 0,
                "commission": pos.commission / divisor if pos.HasField("commission") else 0,
                "status": "open",
            })
        return positions

    async def get_historical_deals(
        self,
        ctid_trader_account_id: int,
        from_timestamp: int,
        to_timestamp: int,
    ) -> List[Dict[str, Any]]:
        """Fetches historical deals within a timestamp range (in milliseconds)."""
        req = Protobuf.get(
            "ProtoOADealListReq",
            ctidTraderAccountId=ctid_trader_account_id,
            fromTimestamp=from_timestamp,
            toTimestamp=to_timestamp,
            maxRows=1000,
        )
        res = await self._send_async(req, timeout=15.0)
        deals = []
        for deal in res.deal:
            symbol_name = self._get_symbol_name(ctid_trader_account_id, deal.symbolId)
            money_digits = getattr(deal, "moneyDigits", 2)
            divisor = 10 ** money_digits

            d: Dict[str, Any] = {
                "dealId": str(deal.dealId),
                "positionId": str(deal.positionId),
                "symbol": symbol_name,
                "volume": deal.volume / 100.0,
                "executionPrice": deal.executionPrice,
                "tradeSide": "long" if deal.tradeSide == 1 else "short",
                "executionTime": deal.executionTimestamp,
                "commission": deal.commission / divisor if deal.HasField("commission") else 0,
            }

            if deal.HasField("closePositionDetail"):
                cpd = deal.closePositionDetail
                d["isClose"] = True
                d["entryPrice"] = cpd.entryPrice
                d["exitPrice"] = deal.executionPrice
                d["grossProfit"] = cpd.grossProfit / divisor
                d["swap"] = cpd.swap / divisor
                d["balance"] = cpd.balance / divisor
            else:
                d["isClose"] = False
                d["entryPrice"] = deal.executionPrice

            deals.append(d)
        return deals

    def subscribe_sse(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        self.subscribers.append(q)
        return q

    def unsubscribe_sse(self, q: asyncio.Queue):
        if q in self.subscribers:
            self.subscribers.remove(q)

    @property
    def status(self) -> Dict[str, Any]:
        return {
            "connected": self._is_connected,
            "host": self.host,
            "port": self.port,
            "appAuthorized": self._app_authorized,
            "appAuthError": self._app_auth_error,
            "authorizedAccounts": list(self.authorized_accounts),
            "subscribersCount": len(self.subscribers),
        }

client_manager = CTraderClientManager()
