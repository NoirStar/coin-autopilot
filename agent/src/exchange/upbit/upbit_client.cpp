#include "upbit_client.hpp"
#include <spdlog/spdlog.h>

namespace autopilot {

UpbitClient::UpbitClient(const ExchangeConfig& config) : config_(config) {
    spdlog::info("UpbitClient initialized (rate_limit={}req/s)", config.rate_limit_per_second);
}

// TODO: Implement all methods using Boost.Beast HTTP/WebSocket
// Upbit API docs: https://docs.upbit.com

OrderResult UpbitClient::place_order(const OrderRequest& order) { return {}; }
bool UpbitClient::cancel_order(const std::string&, const std::string&) { return false; }
std::vector<Position> UpbitClient::get_positions() { return {}; }
double UpbitClient::get_balance() { return 0; }
std::vector<Candle> UpbitClient::get_candles(const std::string&, const std::string&, int) { return {}; }
Ticker UpbitClient::get_ticker(const std::string&) { return {}; }
void UpbitClient::connect_ws() { ws_connected_ = true; }
void UpbitClient::disconnect_ws() { ws_connected_ = false; }
bool UpbitClient::is_ws_connected() const { return ws_connected_; }
void UpbitClient::subscribe_ticker(const std::string&, TickerCallback) {}
void UpbitClient::subscribe_candles(const std::string&, const std::string&, CandleCallback) {}
std::string UpbitClient::generate_jwt(const std::string&) const { return ""; }

} // namespace autopilot
