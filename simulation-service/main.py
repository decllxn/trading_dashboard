import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any

app = FastAPI(title="Trading Simulation Service", version="1.0.0")

# Enable CORS for Next.js app communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class MonteCarloRequest(BaseModel):
    historical_r_multiples: List[float] = Field(..., description="List of historical trade R-multiples")
    num_simulations: int = Field(1000, ge=10, le=10000)
    num_trades: int = Field(100, ge=5, le=500)
    risk_per_trade: float = Field(0.01, ge=0.0, le=0.20, description="Risk fraction per trade (e.g. 0.01 for 1%)")
    ruin_threshold: float = Field(50.0, ge=0.0, le=100.0, description="Ruin threshold as % of initial equity (0-100)")
    initial_equity: float = Field(100.0, description="Starting equity (normalized to 100%)")

class PositionSizingRequest(BaseModel):
    historical_r_multiples: List[float] = Field(..., description="List of historical trade R-multiples")
    risk_ranges: List[float] = Field([0.005, 0.01, 0.015, 0.02, 0.03, 0.05], description="List of risk percentages (as fractions)")
    num_simulations: int = Field(1000, ge=10, le=5000)
    num_trades: int = Field(100, ge=5, le=500)
    ruin_threshold: float = Field(50.0, description="Ruin threshold as % of initial equity")
    initial_equity: float = Field(100.0)

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "simulation-service"}

@app.post("/simulate/monte-carlo")
def simulate_monte_carlo(req: MonteCarloRequest):
    r_mults = np.array(req.historical_r_multiples)
    if len(r_mults) == 0:
        # If no trade history, default to a balanced synthetic sequence
        r_mults = np.array([1.5, -1.0, 2.0, -1.0, 0.5, -0.5])
    
    S = req.num_simulations
    T = req.num_trades
    risk = req.risk_per_trade
    initial = req.initial_equity
    ruin_val = req.ruin_threshold
    
    # Resample with replacement: shape (S, T)
    indices = np.random.choice(len(r_mults), size=(S, T), replace=True)
    sampled_r = r_mults[indices]
    
    # Compounded percentage returns: E_t = E_{t-1} * (1 + risk * R_t)
    growth_factors = 1.0 + (risk * sampled_r)
    
    curves = np.zeros((S, T + 1))
    curves[:, 0] = initial
    curves[:, 1:] = initial * np.cumprod(growth_factors, axis=1)
    
    # Compute percentiles along the simulations axis (axis 0) for each trade step
    p10 = np.percentile(curves, 10, axis=0)
    p25 = np.percentile(curves, 25, axis=0)
    p50 = np.percentile(curves, 50, axis=0)
    p75 = np.percentile(curves, 75, axis=0)
    p90 = np.percentile(curves, 90, axis=0)
    
    # Compute maximum drawdown for each simulated path
    # Peak is the running maximum along trade steps (axis 1)
    running_peaks = np.maximum.accumulate(curves, axis=1)
    drawdowns = (running_peaks - curves) / running_peaks * 100.0
    max_drawdowns = np.max(drawdowns, axis=1) # shape (S,)
    
    # Drawdown percentiles
    mdd_pct = {
        "10": float(np.percentile(max_drawdowns, 10)),
        "25": float(np.percentile(max_drawdowns, 25)),
        "50": float(np.percentile(max_drawdowns, 50)),
        "75": float(np.percentile(max_drawdowns, 75)),
        "90": float(np.percentile(max_drawdowns, 90)),
        "mean": float(np.mean(max_drawdowns))
    }
    
    # Ruin probability: fraction of paths that cross below the ruin_threshold % of initial
    ruined = np.any(curves < ruin_val, axis=1)
    ruin_probability = float(np.mean(ruined))
    
    # Format curves for frontend charting
    percentile_curves = []
    for t in range(T + 1):
        percentile_curves.append({
            "trade_index": t,
            "p10": float(p10[t]),
            "p25": float(p25[t]),
            "p50": float(p50[t]),
            "p75": float(p75[t]),
            "p90": float(p90[t]),
        })
        
    return {
        "percentile_curves": percentile_curves,
        "max_drawdown_percentiles": mdd_pct,
        "ruin_probability": ruin_probability,
        "num_simulations": S,
        "num_trades": T
    }

@app.post("/simulate/position-sizing")
def simulate_position_sizing(req: PositionSizingRequest):
    r_mults = np.array(req.historical_r_multiples)
    if len(r_mults) == 0:
        r_mults = np.array([1.5, -1.0, 2.0, -1.0, 0.5, -0.5])
        
    S = req.num_simulations
    T = req.num_trades
    initial = req.initial_equity
    ruin_val = req.ruin_threshold
    
    indices = np.random.choice(len(r_mults), size=(S, T), replace=True)
    sampled_r = r_mults[indices]
    
    results = []
    for risk in req.risk_ranges:
        growth_factors = 1.0 + (risk * sampled_r)
        curves = np.zeros((S, T + 1))
        curves[:, 0] = initial
        curves[:, 1:] = initial * np.cumprod(growth_factors, axis=1)
        
        ending_equities = curves[:, -1]
        
        running_peaks = np.maximum.accumulate(curves, axis=1)
        drawdowns = (running_peaks - curves) / running_peaks * 100.0
        max_drawdowns = np.max(drawdowns, axis=1)
        
        ruined = np.any(curves < ruin_val, axis=1)
        
        results.append({
            "risk_percentage": float(risk * 100.0),
            "mean_ending_equity": float(np.mean(ending_equities)),
            "median_ending_equity": float(np.percentile(ending_equities, 50)),
            "mean_max_drawdown": float(np.mean(max_drawdowns)),
            "median_max_drawdown": float(np.percentile(max_drawdowns, 50)),
            "ruin_probability": float(np.mean(ruined))
        })
        
    return {
        "results": results
    }
