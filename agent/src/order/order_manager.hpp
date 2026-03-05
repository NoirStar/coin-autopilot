#pragma once
#include "core/types.hpp"
#include <string>
namespace autopilot {
class OrderManager {
public:
    // TODO: Order lifecycle management
    // - Create, submit, track, confirm/fail
    // - Rate limiting per exchange
    // - Retry logic
    // - Reduce-only enforcement for futures
};
} // namespace autopilot
