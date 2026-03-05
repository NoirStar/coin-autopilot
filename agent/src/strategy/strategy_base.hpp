#pragma once

#include "core/types.hpp"
#include <vector>
#include <string>

namespace autopilot {

// Base strategy interface
class StrategyBase {
public:
    virtual ~StrategyBase() = default;

    virtual std::string name() const = 0;
    virtual std::string type() const = 0;

    // Evaluate strategy and return signals (if any)
    virtual std::vector<StrategySignal> evaluate(
        const RegimeInfo& regime,
        const std::vector<AltZScore>& alt_scores,
        const std::vector<Position>& current_positions
    ) = 0;

    // Check if position should be closed
    virtual bool should_close(
        const Position& position,
        const RegimeInfo& regime,
        const AltZScore& current_score
    ) = 0;

    virtual void set_enabled(bool enabled) { enabled_ = enabled; }
    virtual bool is_enabled() const { return enabled_; }

protected:
    bool enabled_ = false;
};

} // namespace autopilot
