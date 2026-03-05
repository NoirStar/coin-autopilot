#pragma once

#include "core/types.hpp"
#include <vector>
#include <deque>
#include <cmath>
#include <algorithm>
#include <numeric>

namespace autopilot {

class IndicatorEngine {
public:
    // EMA — Exponential Moving Average
    static double ema(const std::deque<double>& prices, int period);

    // RSI — Relative Strength Index
    static double rsi(const std::deque<double>& closes, int period = 14);

    // ATR — Average True Range
    static double atr(const std::deque<Candle>& candles, int period = 14);

    // ATR% — ATR as percentage of close
    static double atr_pct(const std::deque<Candle>& candles, int period = 14);

    // SMA — Simple Moving Average
    static double sma(const std::deque<double>& values, int period);

    // Standard Deviation
    static double stdev(const std::deque<double>& values, int period);

    // Z-Score
    static double zscore(const std::deque<double>& values, int period);

    // Bollinger Bands
    struct BollingerResult {
        double upper;
        double middle;
        double lower;
    };
    static BollingerResult bollinger(const std::deque<double>& prices, int period = 20, double multiplier = 2.0);

    // MACD
    struct MacdResult {
        double macd_line;
        double signal_line;
        double histogram;
    };
    static MacdResult macd(const std::deque<double>& prices, int fast = 12, int slow = 26, int signal = 9);

    // Alt/BTC ratio z-score
    static AltZScore compute_alt_zscore(
        const std::string& symbol,
        const std::deque<double>& alt_prices,
        const std::deque<double>& btc_prices,
        int z_window = 20
    );

    // Full indicator state for a symbol
    static IndicatorState compute_state(
        const std::deque<Candle>& candles,
        int ema_len = 200,
        int rsi_len = 14,
        int atr_len = 14
    );
};

} // namespace autopilot
