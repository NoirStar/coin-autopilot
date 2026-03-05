#pragma once
#include "strategy_base.hpp"
namespace autopilot {
class VolatilityTimingStrategy : public StrategyBase {
public:
    std::string name() const override { return "BTC Volatility Timing"; }
    std::string type() const override { return "volatility_timing"; }
    std::vector<StrategySignal> evaluate(const RegimeInfo&, const std::vector<AltZScore>&, const std::vector<Position>&) override { return {}; }
    bool should_close(const Position&, const RegimeInfo&, const AltZScore&) override { return false; }
};
} // namespace autopilot
