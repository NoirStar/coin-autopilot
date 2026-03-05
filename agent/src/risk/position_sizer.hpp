#pragma once
#include "core/types.hpp"
namespace autopilot {
class PositionSizer {
public:
    struct Config {
        double equity = 0;
        double risk_per_trade_pct = 0.30;  // 0.30% of equity
        double stop_atr_mult = 2.7;
    };
    explicit PositionSizer(const Config& config) : config_(config) {}
    double compute_qty(double entry_price, double atr) const {
        double stop_distance = config_.stop_atr_mult * atr;
        if (stop_distance <= 0 || entry_price <= 0) return 0;
        double allowed_loss = config_.equity * (config_.risk_per_trade_pct / 100.0);
        double qty = allowed_loss / stop_distance;
        return qty;
    }
    void update_equity(double equity) { config_.equity = equity; }
private:
    Config config_;
};
} // namespace autopilot
