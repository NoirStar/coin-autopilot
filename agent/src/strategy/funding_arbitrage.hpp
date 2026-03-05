#pragma once
#include "strategy_base.hpp"
namespace autopilot {
class FundingArbitrageStrategy : public StrategyBase {
public:
    std::string name() const override { return "Funding Rate Arbitrage"; }
    std::string type() const override { return "funding_arbitrage"; }
    std::vector<StrategySignal> evaluate(const RegimeInfo&, const std::vector<AltZScore>&, const std::vector<Position>&) override { return {}; }
    bool should_close(const Position&, const RegimeInfo&, const AltZScore&) override { return false; }
};
} // namespace autopilot
