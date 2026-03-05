#include "indicator_engine.hpp"
#include <cmath>
#include <stdexcept>

namespace autopilot {

double IndicatorEngine::ema(const std::deque<double>& prices, int period) {
    if (static_cast<int>(prices.size()) < period) return prices.back();

    double multiplier = 2.0 / (period + 1);
    double result = 0;

    // Start with SMA of first 'period' values
    for (int i = 0; i < period; ++i) {
        result += prices[i];
    }
    result /= period;

    // Then apply EMA formula
    for (size_t i = period; i < prices.size(); ++i) {
        result = (prices[i] - result) * multiplier + result;
    }

    return result;
}

double IndicatorEngine::rsi(const std::deque<double>& closes, int period) {
    if (static_cast<int>(closes.size()) < period + 1) return 50.0;

    double avg_gain = 0, avg_loss = 0;

    // Initial average
    for (int i = 1; i <= period; ++i) {
        double change = closes[i] - closes[i - 1];
        if (change > 0) avg_gain += change;
        else avg_loss += std::abs(change);
    }
    avg_gain /= period;
    avg_loss /= period;

    // Smoothed RSI
    for (size_t i = period + 1; i < closes.size(); ++i) {
        double change = closes[i] - closes[i - 1];
        if (change > 0) {
            avg_gain = (avg_gain * (period - 1) + change) / period;
            avg_loss = (avg_loss * (period - 1)) / period;
        } else {
            avg_gain = (avg_gain * (period - 1)) / period;
            avg_loss = (avg_loss * (period - 1) + std::abs(change)) / period;
        }
    }

    if (avg_loss == 0) return 100.0;
    double rs = avg_gain / avg_loss;
    return 100.0 - (100.0 / (1.0 + rs));
}

double IndicatorEngine::atr(const std::deque<Candle>& candles, int period) {
    if (static_cast<int>(candles.size()) < period + 1) return 0;

    std::vector<double> trs;
    for (size_t i = 1; i < candles.size(); ++i) {
        double tr = std::max({
            candles[i].high - candles[i].low,
            std::abs(candles[i].high - candles[i - 1].close),
            std::abs(candles[i].low - candles[i - 1].close)
        });
        trs.push_back(tr);
    }

    if (static_cast<int>(trs.size()) < period) return trs.back();

    // Simple average of first 'period' TRs
    double avg = 0;
    for (int i = 0; i < period; ++i) avg += trs[i];
    avg /= period;

    // Smoothed ATR
    for (size_t i = period; i < trs.size(); ++i) {
        avg = (avg * (period - 1) + trs[i]) / period;
    }

    return avg;
}

double IndicatorEngine::atr_pct(const std::deque<Candle>& candles, int period) {
    double atr_val = atr(candles, period);
    double close = candles.back().close;
    if (close == 0) return 0;
    return atr_val / close;
}

double IndicatorEngine::sma(const std::deque<double>& values, int period) {
    if (static_cast<int>(values.size()) < period) {
        double sum = std::accumulate(values.begin(), values.end(), 0.0);
        return sum / values.size();
    }
    double sum = 0;
    for (int i = static_cast<int>(values.size()) - period; i < static_cast<int>(values.size()); ++i) {
        sum += values[i];
    }
    return sum / period;
}

double IndicatorEngine::stdev(const std::deque<double>& values, int period) {
    if (static_cast<int>(values.size()) < period) return 0;
    double mean = sma(values, period);
    double sq_sum = 0;
    for (int i = static_cast<int>(values.size()) - period; i < static_cast<int>(values.size()); ++i) {
        sq_sum += (values[i] - mean) * (values[i] - mean);
    }
    return std::sqrt(sq_sum / period);
}

double IndicatorEngine::zscore(const std::deque<double>& values, int period) {
    double mean = sma(values, period);
    double sd = stdev(values, period);
    if (sd == 0) return 0;
    return (values.back() - mean) / sd;
}

IndicatorEngine::BollingerResult IndicatorEngine::bollinger(
    const std::deque<double>& prices, int period, double multiplier
) {
    double middle = sma(prices, period);
    double sd = stdev(prices, period);
    return {
        middle + multiplier * sd,
        middle,
        middle - multiplier * sd
    };
}

IndicatorEngine::MacdResult IndicatorEngine::macd(
    const std::deque<double>& prices, int fast, int slow, int signal
) {
    double fast_ema = ema(prices, fast);
    double slow_ema = ema(prices, slow);
    double macd_line = fast_ema - slow_ema;
    // Signal line is simplified here; full implementation needs history
    return { macd_line, 0, macd_line };
}

AltZScore IndicatorEngine::compute_alt_zscore(
    const std::string& symbol,
    const std::deque<double>& alt_prices,
    const std::deque<double>& btc_prices,
    int z_window
) {
    AltZScore result;
    result.symbol = symbol;

    if (alt_prices.empty() || btc_prices.empty()) {
        result.ratio = 0;
        result.z_score = 0;
        return result;
    }

    // Calculate ln(ALT/BTC) ratio series
    int len = std::min(alt_prices.size(), btc_prices.size());
    std::deque<double> ratios;
    for (int i = 0; i < len; ++i) {
        if (btc_prices[i] > 0 && alt_prices[i] > 0) {
            ratios.push_back(std::log(alt_prices[i] / btc_prices[i]));
        }
    }

    result.ratio = ratios.empty() ? 0 : ratios.back();
    result.z_score = zscore(ratios, z_window);

    return result;
}

IndicatorState IndicatorEngine::compute_state(
    const std::deque<Candle>& candles, int ema_len, int rsi_len, int atr_len
) {
    IndicatorState state{};
    if (candles.empty()) return state;

    std::deque<double> closes;
    for (const auto& c : candles) closes.push_back(c.close);

    state.ema200 = ema(closes, ema_len);
    state.rsi14 = rsi(closes, rsi_len);
    state.atr14 = atr(candles, atr_len);
    state.atr_pct = (candles.back().close > 0) ? state.atr14 / candles.back().close : 0;
    state.sma20 = sma(closes, 20);
    state.std20 = stdev(closes, 20);

    return state;
}

} // namespace autopilot
