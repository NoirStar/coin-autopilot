#pragma once

#include <string>
#include <vector>
#include <cstdint>
#include <optional>

namespace autopilot {

// =====================================================
// Enums
// =====================================================

enum class Exchange { Upbit, OKX };

enum class Side { Buy, Sell };

enum class OrderType { Market, Limit, Stop };

enum class MarginMode { Isolated, Cross };

enum class RegimeState { RiskOn, RiskOff, Neutral };

enum class AgentMode { Live, Paper };

enum class RiskProfile { Conservative, Moderate, Aggressive };

// =====================================================
// Data Structures
// =====================================================

struct Candle {
    int64_t open_time_ms;
    double open;
    double high;
    double low;
    double close;
    double volume;
};

struct Ticker {
    std::string symbol;
    double price;
    double bid;
    double ask;
    double volume_24h;
    int64_t timestamp_ms;
};

struct OrderRequest {
    Exchange exchange;
    std::string symbol;
    Side side;
    OrderType type;
    double qty;
    double price;           // 0 for market orders
    bool reduce_only;
    std::optional<double> stop_price;
};

struct OrderResult {
    std::string order_id;
    std::string symbol;
    Side side;
    double filled_qty;
    double avg_price;
    double fee;
    bool success;
    std::string error_message;
    int64_t executed_at_ms;
};

struct Position {
    std::string strategy_id;
    std::string session_id;     // empty = live
    Exchange exchange;
    std::string symbol;
    Side side;
    double qty;
    double entry_price;
    double current_price;
    double unrealized_pnl;
    double stop_price;
    double leverage;
    MarginMode margin_mode;
    int64_t opened_at_ms;
    int32_t bars_held;
};

struct RegimeInfo {
    RegimeState state;
    double btc_price;
    double btc_ema200;
    double btc_rsi14;
    double btc_atr_pct;
    int64_t timestamp_ms;
};

struct StrategySignal {
    std::string strategy_name;
    std::string symbol;
    Side side;
    double strength;            // 0.0 ~ 1.0
    std::string reason;
    double suggested_stop;
    double suggested_qty;
};

struct RiskLimits {
    RiskProfile profile;
    double max_leverage;
    int32_t max_positions;
    double max_daily_loss_pct;
    double max_drawdown_pct;
    double drawdown_halt_pct;
    double stop_atr_mult;
    double max_margin_usage_pct;
};

struct EquitySnapshot {
    double total_equity_krw;
    double total_equity_usd;
    double upbit_balance_krw;
    double okx_balance_usd;
    double daily_pnl;
    double daily_pnl_pct;
    double max_drawdown_pct;
    int64_t timestamp_ms;
};

// =====================================================
// Indicator Results
// =====================================================

struct IndicatorState {
    double ema200;
    double rsi14;
    double atr14;
    double atr_pct;
    double sma20;
    double std20;
};

struct AltZScore {
    std::string symbol;
    double ratio;               // ln(ALT/BTC)
    double z_score;
    double rsi;
    double atr;
    double spread_bp;
};

} // namespace autopilot
