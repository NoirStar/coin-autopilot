#include "candle_store.hpp"

namespace autopilot {

const std::deque<Candle> CandleStore::empty_;

void CandleStore::add_candle(const std::string& key, const Candle& candle) {
    auto& dq = store_[key];
    dq.push_back(candle);
    while (static_cast<int>(dq.size()) > max_size_) {
        dq.pop_front();
    }
}

const std::deque<Candle>& CandleStore::get_candles(const std::string& key) const {
    auto it = store_.find(key);
    if (it == store_.end()) return empty_;
    return it->second;
}

bool CandleStore::has_enough(const std::string& key, int min_count) const {
    auto it = store_.find(key);
    if (it == store_.end()) return false;
    return static_cast<int>(it->second.size()) >= min_count;
}

std::string CandleStore::make_key(const std::string& exchange, const std::string& symbol, const std::string& tf) {
    return exchange + ":" + symbol + ":" + tf;
}

} // namespace autopilot
