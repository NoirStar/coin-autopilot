#pragma once

#include "core/types.hpp"
#include "core/config.hpp"
#include <memory>
#include <atomic>
#include <string>

namespace autopilot {

class Engine {
public:
    explicit Engine(const AgentConfig& config);
    ~Engine();

    // Lifecycle
    void start();
    void stop();
    void pause();
    void resume();

    // State
    bool is_running() const { return running_.load(); }
    AgentMode mode() const { return mode_; }

private:
    void run_loop();
    void on_candle_close(const std::string& symbol, const Candle& candle);
    void evaluate_regime();
    void evaluate_strategies();
    void reconcile_positions();

    AgentConfig config_;
    AgentMode mode_;
    std::atomic<bool> running_{false};
    std::atomic<bool> paused_{false};

    RegimeInfo current_regime_;

    // Sub-modules (to be initialized in constructor)
    // std::unique_ptr<MarketDataManager> market_data_;
    // std::unique_ptr<IndicatorEngine> indicators_;
    // std::unique_ptr<StrategyEngine> strategies_;
    // std::unique_ptr<OrderManager> orders_;
    // std::unique_ptr<RiskManager> risk_;
    // std::unique_ptr<GrpcReporter> reporter_;
};

} // namespace autopilot
