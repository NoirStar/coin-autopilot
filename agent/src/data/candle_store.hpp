#pragma once
#include "core/types.hpp"
#include <deque>
#include <string>
#include <unordered_map>

namespace autopilot {

class CandleStore {
public:
    void add_candle(const std::string& key, const Candle& candle);
    const std::deque<Candle>& get_candles(const std::string& key) const;
    bool has_enough(const std::string& key, int min_count) const;
    void set_max_size(int size) { max_size_ = size; }

    // Key format: "exchange:symbol:timeframe" e.g. "upbit:KRW-BTC:4h"
    static std::string make_key(const std::string& exchange, const std::string& symbol, const std::string& tf);

private:
    std::unordered_map<std::string, std::deque<Candle>> store_;
    int max_size_ = 500;
    static const std::deque<Candle> empty_;
};

} // namespace autopilot
