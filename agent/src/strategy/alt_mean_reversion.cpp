#include "alt_mean_reversion.hpp"
#include <spdlog/spdlog.h>
#include <algorithm>

namespace autopilot {

AltMeanReversionStrategy::AltMeanReversionStrategy(const Params& params)
    : params_(params) {}

std::vector<StrategySignal> AltMeanReversionStrategy::evaluate(
    const RegimeInfo& regime,
    const std::vector<AltZScore>& alt_scores,
    const std::vector<Position>& current_positions
) {
    std::vector<StrategySignal> signals;

    // Only generate signals in Risk-On regime
    if (regime.state != RegimeState::RiskOn) {
        return signals;
    }

    // Count current positions for this strategy
    int active_count = 0;
    for (const auto& pos : current_positions) {
        if (pos.strategy_id == type()) active_count++;
    }

    // Evaluate each alt
    for (const auto& alt : alt_scores) {
        // Skip if already have max positions
        if (active_count >= 5) break;  // MAX_POSITIONS from risk config

        // Skip if already in position for this symbol
        bool already_in = false;
        for (const auto& pos : current_positions) {
            if (pos.symbol == alt.symbol && pos.strategy_id == type()) {
                already_in = true;
                break;
            }
        }
        if (already_in) continue;

        // Entry conditions:
        // 1. z_i <= zscore_entry (-1.0) — ALT underperforming BTC
        // 2. ALT RSI <= alt_rsi_entry_max (78) — not overbought
        // 3. Spread <= spread_max_bp (15bp) — sufficient liquidity
        bool z_condition = alt.z_score <= params_.zscore_entry;
        bool rsi_condition = alt.rsi <= params_.alt_rsi_entry_max;
        bool spread_condition = alt.spread_bp <= params_.spread_max_bp;

        if (z_condition && rsi_condition && spread_condition) {
            StrategySignal signal;
            signal.strategy_name = name();
            signal.symbol = alt.symbol;
            signal.side = Side::Buy;
            signal.strength = std::min(1.0, std::abs(alt.z_score) / 2.0);
            signal.reason = "entry_signal";
            signal.suggested_stop = 0;  // Calculated by RiskManager using ATR
            signal.suggested_qty = 0;   // Calculated by PositionSizer

            signals.push_back(signal);
            active_count++;

            spdlog::info("[{}] Entry signal: {} z={:.2f} rsi={:.1f} spread={:.1f}bp",
                         name(), alt.symbol, alt.z_score, alt.rsi, alt.spread_bp);
        }
    }

    return signals;
}

bool AltMeanReversionStrategy::should_close(
    const Position& position,
    const RegimeInfo& regime,
    const AltZScore& current_score
) {
    // Priority 0: Regime stop — BTC goes Risk-Off
    if (regime.state == RegimeState::RiskOff) {
        spdlog::warn("[{}] Regime stop: {} — BTC Risk-Off", name(), position.symbol);
        return true;
    }

    // Priority 0: ATR stop — handled by RiskManager externally

    // Priority 1: Take profit — z_i >= zscore_exit (0.0)
    if (current_score.z_score >= params_.zscore_exit) {
        spdlog::info("[{}] Take profit: {} z={:.2f}", name(), position.symbol, current_score.z_score);
        return true;
    }

    // Priority 2: Time exit — held >= max_hold_bars
    if (position.bars_held >= params_.max_hold_bars) {
        spdlog::info("[{}] Time exit: {} bars={}", name(), position.symbol, position.bars_held);
        return true;
    }

    return false;
}

AltMeanReversionStrategy::Params AltMeanReversionStrategy::from_config(
    const std::map<std::string, std::string>& cfg
) {
    Params p;
    auto get = [&](const std::string& key, double def) -> double {
        auto it = cfg.find(key);
        if (it != cfg.end()) return std::stod(it->second);
        return def;
    };
    auto get_int = [&](const std::string& key, int def) -> int {
        auto it = cfg.find(key);
        if (it != cfg.end()) return std::stoi(it->second);
        return def;
    };

    p.btc_ema_len = get_int("btc_ema_len", 200);
    p.btc_rsi_len = get_int("btc_rsi_len", 14);
    p.btc_rsi_risk_on_min = get("btc_rsi_risk_on_min", 52.0);
    p.btc_rsi_risk_on_max = get("btc_rsi_risk_on_max", 70.0);
    p.btc_rsi_risk_off = get("btc_rsi_risk_off", 45.0);
    p.btc_atr_len = get_int("btc_atr_len", 14);
    p.btc_atr_risk_on_max = get("btc_atr_risk_on_max", 0.045);
    p.btc_atr_risk_off_min = get("btc_atr_risk_off_min", 0.065);
    p.alt_rsi_len = get_int("alt_rsi_len", 14);
    p.alt_rsi_entry_max = get("alt_rsi_entry_max", 78.0);
    p.zscore_window = get_int("zscore_window", 20);
    p.zscore_entry = get("zscore_entry", -1.0);
    p.zscore_exit = get("zscore_exit", 0.0);
    p.stop_atr_mult = get("stop_atr_mult", 2.7);
    p.max_hold_bars = get_int("max_hold_bars", 8);
    p.spread_max_bp = get("spread_max_bp", 15.0);

    return p;
}

} // namespace autopilot
