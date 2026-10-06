import logging
from ctrader_open_api import Auth
from config import CTRADER_CLIENT_ID, CTRADER_CLIENT_SECRET

logger = logging.getLogger("ctrader.auth")

def get_auth_client(redirect_uri: str) -> Auth:
    return Auth(CTRADER_CLIENT_ID, CTRADER_CLIENT_SECRET, redirect_uri)

def get_auth_url(redirect_uri: str, scope: str = "trading") -> str:
    auth = get_auth_client(redirect_uri)
    return auth.getAuthUri(scope=scope)

def exchange_code(code: str, redirect_uri: str) -> dict:
    auth = get_auth_client(redirect_uri)
    logger.info("Exchanging auth code with cTrader OpenAPI token endpoint...")
    token_data = auth.getToken(code)
    logger.info("Token response received: %s", {k: v for k, v in token_data.items() if k != "accessToken" and k != "refreshToken"})
    return token_data

def refresh_access_token(refresh_token: str, redirect_uri: str = "") -> dict:
    auth = get_auth_client(redirect_uri)
    logger.info("Refreshing cTrader access token...")
    return auth.refreshToken(refresh_token)
