#pragma once
#include "strategy_base.hpp"
namespace autopilot {
class DominanceRotationStrategy : public StrategyBase {
public:
    std::string name() const override { return "BTC Dominance Rotation"; }
    std::string type() const override { return "dominance_rotation"; }
    std::vector<StrategySignal> evaluate(const RegimeInfo&, const std::vector<AltZScore>&, const std::vector<Position>&) override { return {}; }
    bool should_close(const Position&, const RegimeInfo&, const AltZScore&) override { return false; }
};
} // namespace autopilot
