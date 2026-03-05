#include "risk_manager.hpp"
#include <spdlog/spdlog.h>
#include <algorithm>
namespace autopilot {

RiskManager::RiskManager(const Config& config) : config_(config) {}

bool RiskManager::can_open_position() const {
    if (open_positions_ >= config_.max_positions) return false;
    if (check_daily_loss()) return false;
    if (check_drawdown()) return false;
    return true;
}

bool RiskManager::check_daily_loss() const {
    if (current_equity_ == 0) return false;
    double loss_pct = std::abs(daily_pnl_) / current_equity_ * 100.0;
    return daily_pnl_ < 0 && loss_pct >= config_.max_daily_loss_pct;
}

bool RiskManager::check_drawdown() const {
    if (peak_equity_ == 0) return false;
    double dd = (peak_equity_ - current_equity_) / peak_equity_ * 100.0;
    if (dd >= config_.drawdown_halt_pct) {
        spdlog::critical("DRAWDOWN HALT: {:.1f}% >= {:.1f}% — trading suspended", dd, config_.drawdown_halt_pct);
        return true;
    }
    if (dd >= config_.max_drawdown_pct) {
        spdlog::warn("DRAWDOWN WARNING: {:.1f}% >= {:.1f}% — risk reduced 50%", dd, config_.max_drawdown_pct);
    }
    return false;
}

double RiskManager::compute_stop_price(double entry_price, double atr, Side side) const {
    double stop_distance = config_.stop_atr_mult * atr;
    if (side == Side::Buy) return entry_price - stop_distance;
    return entry_price + stop_distance;
}

void RiskManager::update_equity(double equity) {
    current_equity_ = equity;
    peak_equity_ = std::max(peak_equity_, equity);
}

void RiskManager::record_trade_pnl(double pnl) {
    daily_pnl_ += pnl;
}

void RiskManager::reset_daily() {
    daily_pnl_ = 0;
}

} // namespace autopilot
