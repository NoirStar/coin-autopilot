#pragma once
#include "exchange/exchange_base.hpp"
#include "core/config.hpp"

namespace autopilot {

// Upbit spot exchange client
class UpbitClient : public ExchangeBase {
public:
    explicit UpbitClient(const ExchangeConfig& config);
    Exchange exchange_type() const override { return Exchange::Upbit; }
    std::string name() const override { return "Upbit"; }

    OrderResult place_order(const OrderRequest& order) override;
    bool cancel_order(const std::string& order_id, const std::string& symbol) override;
    std::vector<Position> get_positions() override;
    double get_balance() override;
    std::vector<Candle> get_candles(const std::string& symbol, const std::string& timeframe, int limit) override;
    Ticker get_ticker(const std::string& symbol) override;
    void connect_ws() override;
    void disconnect_ws() override;
    bool is_ws_connected() const override;
    void subscribe_ticker(const std::string& symbol, TickerCallback cb) override;
    void subscribe_candles(const std::string& symbol, const std::string& tf, CandleCallback cb) override;

private:
    ExchangeConfig config_;
    bool ws_connected_ = false;
    // JWT token generation for Upbit auth
    std::string generate_jwt(const std::string& query = "") const;
};

} // namespace autopilot
