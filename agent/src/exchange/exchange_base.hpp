#pragma once
#include "core/types.hpp"
#include <string>
#include <vector>
#include <functional>

namespace autopilot {

// Abstract exchange interface
class ExchangeBase {
public:
    virtual ~ExchangeBase() = default;
    virtual Exchange exchange_type() const = 0;
    virtual std::string name() const = 0;

    // REST API
    virtual OrderResult place_order(const OrderRequest& order) = 0;
    virtual bool cancel_order(const std::string& order_id, const std::string& symbol) = 0;
    virtual std::vector<Position> get_positions() = 0;
    virtual double get_balance() = 0;

    // Market data
    virtual std::vector<Candle> get_candles(const std::string& symbol, const std::string& timeframe, int limit) = 0;
    virtual Ticker get_ticker(const std::string& symbol) = 0;

    // WebSocket
    virtual void connect_ws() = 0;
    virtual void disconnect_ws() = 0;
    virtual bool is_ws_connected() const = 0;

    using TickerCallback = std::function<void(const Ticker&)>;
    using CandleCallback = std::function<void(const std::string&, const Candle&)>;
    virtual void subscribe_ticker(const std::string& symbol, TickerCallback cb) = 0;
    virtual void subscribe_candles(const std::string& symbol, const std::string& tf, CandleCallback cb) = 0;
};

} // namespace autopilot
