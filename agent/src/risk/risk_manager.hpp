#pragma once
#include "core/types.hpp"
#include <string>
#include <vector>
namespace autopilot {
class RiskManager {
public:
    struct Config {
        RiskProfile profile = RiskProfile::Moderate;
        double max_daily_loss_pct = 2.0;
        double max_single_loss_pct = 0.30;
        double max_drawdown_pct = 15.0;
        double drawdown_halt_pct = 25.0;
        int max_positions = 5;
        double max_leverage = 2.0;
        double max_margin_usage_pct = 35.0;
        double stop_atr_mult = 2.7;
    };
    explicit RiskManager(const Config& config);
    bool can_open_position() const;
    bool check_daily_loss() const;
    bool check_drawdown() const;
    double compute_stop_price(double entry_price, double atr, Side side) const;
    void update_equity(double equity);
    void record_trade_pnl(double pnl);
    void reset_daily();
    Config& config() { return config_; }
private:
    Config config_;
    double peak_equity_ = 0;
    double current_equity_ = 0;
    double daily_pnl_ = 0;
    int open_positions_ = 0;
};
} // namespace autopilot
