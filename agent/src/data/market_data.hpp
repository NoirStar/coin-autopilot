#pragma once
// MarketData manager — subscribes to exchange WebSocket streams
// and feeds candles/tickers to the engine
#include "core/types.hpp"
#include <string>
namespace autopilot {
class MarketDataManager {
public:
    // TODO: Manage WebSocket subscriptions across exchanges
    // Route market data to CandleStore and IndicatorEngine
};
} // namespace autopilot
