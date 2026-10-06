import asyncio
import json
import logging
import time
from typing import Optional
from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from config import PORT, CTRADER_ENVIRONMENT
from auth import get_auth_url, exchange_code, refresh_access_token
from client_manager import client_manager

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("ctrader.api")

app = FastAPI(title="cTrader Open API Bridge Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    logger.info("Starting cTrader Client Manager in %s mode...", CTRADER_ENVIRONMENT)
    loop = asyncio.get_running_loop()
    client_manager.start(loop)

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "timestamp": time.time(),
        "ctrader": client_manager.status,
    }

# =============================================================================
# Auth Endpoints
# =============================================================================

class AuthTokenRequest(BaseModel):
    code: str
    redirect_uri: str

class AuthRefreshRequest(BaseModel):
    refresh_token: str
    redirect_uri: Optional[str] = ""

@app.get("/auth/url")
def get_authorization_url(redirect_uri: str = Query(...)):
    url = get_auth_url(redirect_uri)
    return {"url": url}

@app.post("/auth/token")
def exchange_token(req: AuthTokenRequest):
    try:
        data = exchange_code(req.code, req.redirect_uri)
        if "errorCode" in data:
            raise HTTPException(status_code=400, detail=data.get("description", "Failed to exchange token"))
        return data
    except Exception as e:
        logger.error("Token exchange failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/auth/refresh")
def refresh_token(req: AuthRefreshRequest):
    try:
        data = refresh_access_token(req.refresh_token, req.redirect_uri or "")
        return data
    except Exception as e:
        logger.error("Token refresh failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

# =============================================================================
# Account & Trading Endpoints
# =============================================================================

class DiscoverRequest(BaseModel):
    access_token: str

class AccountAuthRequest(BaseModel):
    account_id: int
    access_token: str

@app.post("/accounts/discover")
async def discover_accounts(req: DiscoverRequest):
    try:
        accounts = await client_manager.get_accounts_by_token(req.access_token)
        return {"accounts": accounts}
    except Exception as e:
        logger.error("Account discovery failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/accounts/auth")
async def auth_account(req: AccountAuthRequest):
    try:
        success = await client_manager.authorize_account(req.account_id, req.access_token)
        return {"success": success}
    except Exception as e:
        logger.error("Account auth failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/accounts/{account_id}/profile")
async def get_profile(account_id: int):
    try:
        profile = await client_manager.get_trader_profile(account_id)
        return profile
    except Exception as e:
        logger.error("Profile fetch failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/accounts/{account_id}/positions")
async def get_positions(account_id: int):
    try:
        positions = await client_manager.get_open_positions(account_id)
        return {"positions": positions}
    except Exception as e:
        logger.error("Positions fetch failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/accounts/{account_id}/deals")
async def get_deals(account_id: int, from_days: int = Query(default=365)):
    try:
        to_ts = int(time.time() * 1000)
        from_ts = to_ts - (from_days * 24 * 60 * 60 * 1000)
        deals = await client_manager.get_historical_deals(account_id, from_ts, to_ts)
        return {"deals": deals}
    except Exception as e:
        logger.error("Deals fetch failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

# =============================================================================
# Real-Time SSE Stream
# =============================================================================

@app.get("/events/stream")
async def stream_events(request: Request):
    """Server-Sent Events endpoint streaming live cTrader events to listeners."""
    q = client_manager.subscribe_sse()

    async def event_generator():
        try:
            # Send initial keepalive
            yield f"data: {json.dumps({'type': 'connected', 'status': client_manager.status})}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(q.get(), timeout=15.0)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    # Heartbeat ping
                    yield f": heartbeat\n\n"
        finally:
            client_manager.unsubscribe_sse(q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)
