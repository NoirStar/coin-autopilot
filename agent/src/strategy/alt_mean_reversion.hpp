#pragma once

#include "strategy_base.hpp"
#include <map>

namespace autopilot {

// Strategy 1: BTC Regime Filter + Alt Mean Reversion (Catch-up)
// Recommended starter strategy from deep research
class AltMeanReversionStrategy : public StrategyBase {
public:
    struct Params {
        // BTC Regime
        int btc_ema_len = 200;
        int btc_rsi_len = 14;
        double btc_rsi_risk_on_min = 52.0;
        double btc_rsi_risk_on_max = 70.0;
        double btc_rsi_risk_off = 45.0;
        int btc_atr_len = 14;
        double btc_atr_risk_on_max = 0.045;
        double btc_atr_risk_off_min = 0.065;

        // Alt signals
        int alt_rsi_len = 14;
        double alt_rsi_entry_max = 78.0;
        int zscore_window = 20;
        double zscore_entry = -1.0;
        double zscore_exit = 0.0;
        double stop_atr_mult = 2.7;
        int max_hold_bars = 8;
        double spread_max_bp = 15.0;
    };

    explicit AltMeanReversionStrategy(const Params& params = {});

    std::string name() const override { return "BTC Regime + Alt Mean Reversion"; }
    std::string type() const override { return "regime_mean_reversion"; }

    std::vector<StrategySignal> evaluate(
        const RegimeInfo& regime,
        const std::vector<AltZScore>& alt_scores,
        const std::vector<Position>& current_positions
    ) override;

    bool should_close(
        const Position& position,
        const RegimeInfo& regime,
        const AltZScore& current_score
    ) override;

    static Params from_config(const std::map<std::string, std::string>& cfg);

private:
    Params params_;
};

} // namespace autopilot
