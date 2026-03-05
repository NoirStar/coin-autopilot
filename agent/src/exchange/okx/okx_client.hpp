#pragma once
#include "exchange/exchange_base.hpp"
#include "core/config.hpp"

namespace autopilot {

// OKX futures exchange client
class OkxClient : public ExchangeBase {
public:
    explicit OkxClient(const ExchangeConfig& config);
    Exchange exchange_type() const override { return Exchange::OKX; }
    std::string name() const override { return "OKX"; }

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

    // OKX-specific
    double get_funding_rate(const std::string& symbol);
    void set_leverage(const std::string& symbol, double leverage, const std::string& margin_mode);

private:
    ExchangeConfig config_;
    bool ws_connected_ = false;
    std::string sign_request(const std::string& timestamp, const std::string& method,
                             const std::string& path, const std::string& body) const;
};

} // namespace autopilot
