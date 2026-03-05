#pragma once
#include "core/types.hpp"
namespace autopilot {
// BTC Regime Filter — shared across strategies
class BtcRegimeFilter {
public:
    struct Params {
        int ema_len = 200;
        int rsi_len = 14;
        double rsi_risk_on_min = 52.0;
        double rsi_risk_on_max = 70.0;
        double rsi_risk_off = 45.0;
        int atr_len = 14;
        double atr_risk_on_max = 0.045;
        double atr_risk_off_min = 0.065;
    };

    explicit BtcRegimeFilter(const Params& params = {}) : params_(params) {}

    RegimeState evaluate(const IndicatorState& btc_state) const {
        bool above_ema = true;  // Needs btc price > ema200 check
        bool rsi_on = btc_state.rsi14 >= params_.rsi_risk_on_min && btc_state.rsi14 <= params_.rsi_risk_on_max;
        bool atr_on = btc_state.atr_pct <= params_.atr_risk_on_max;

        if (rsi_on && atr_on) return RegimeState::RiskOn;

        bool rsi_off = btc_state.rsi14 <= params_.rsi_risk_off;
        bool atr_off = btc_state.atr_pct >= params_.atr_risk_off_min;

        if (rsi_off || atr_off) return RegimeState::RiskOff;

        return RegimeState::Neutral;
    }

private:
    Params params_;
};
} // namespace autopilot
