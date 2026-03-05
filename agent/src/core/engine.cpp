#include "engine.hpp"
#include <spdlog/spdlog.h>

namespace autopilot {

Engine::Engine(const AgentConfig& config) : config_(config) {
    mode_ = (config.mode == "live") ? AgentMode::Live : AgentMode::Paper;
    current_regime_.state = RegimeState::Neutral;

    spdlog::info("Engine initialized: mode={}, agent_id={}",
                 config.mode, config.agent_id);

    // TODO: Initialize sub-modules
    // market_data_ = std::make_unique<MarketDataManager>(config);
    // indicators_ = std::make_unique<IndicatorEngine>();
    // strategies_ = std::make_unique<StrategyEngine>(config.strategies);
    // orders_ = std::make_unique<OrderManager>(config);
    // risk_ = std::make_unique<RiskManager>(config);
    // reporter_ = std::make_unique<GrpcReporter>(config.grpc_server_address);
}

Engine::~Engine() {
    stop();
}

void Engine::start() {
    if (running_.load()) {
        spdlog::warn("Engine already running");
        return;
    }

    spdlog::info("Engine starting...");
    running_.store(true);
    paused_.store(false);

    // TODO: Connect to exchanges
    // TODO: Subscribe to WebSocket streams
    // TODO: Start gRPC reporter
    // TODO: Start main loop

    run_loop();
}

void Engine::stop() {
    if (!running_.load()) return;

    spdlog::info("Engine stopping...");
    running_.store(false);

    // TODO: Graceful shutdown
    // - Cancel pending orders
    // - Disconnect WebSocket
    // - Close gRPC connection
}

void Engine::pause() {
    paused_.store(true);
    spdlog::info("Engine paused — no new signals will be processed");
}

void Engine::resume() {
    paused_.store(false);
    spdlog::info("Engine resumed");
}

void Engine::run_loop() {
    spdlog::info("Main loop started (mode={})", config_.mode);

    while (running_.load()) {
        if (paused_.load()) {
            // Still monitor, but don't trade
            // std::this_thread::sleep_for(std::chrono::seconds(1));
            continue;
        }

        // The main event loop is driven by WebSocket events:
        // 1. Market data arrives via WebSocket callbacks
        // 2. On candle close → evaluate_regime() → evaluate_strategies()
        // 3. Strategy signals → risk check → order submission

        // For now, this is a placeholder.
        // Real implementation will use Boost.Asio io_context.run()
        break;
    }
}

void Engine::on_candle_close(const std::string& symbol, const Candle& candle) {
    // Called when a 4H candle closes
    // 1. Update indicators
    // 2. Evaluate BTC regime
    // 3. Run strategies
    // 4. Execute signals

    if (symbol == "BTCUSDT" || symbol == "KRW-BTC") {
        evaluate_regime();
    }

    evaluate_strategies();
}

void Engine::evaluate_regime() {
    // TODO: Calculate BTC regime from indicators
    // EMA(200), RSI(14), ATR%(14)

    // RegimeState prev = current_regime_.state;
    // ... compute ...
    // if (current_regime_.state != prev) {
    //     spdlog::info("Regime change: {} -> {}", prev, current_regime_.state);
    //     reporter_->report_regime(current_regime_);
    //     if (current_regime_.state == RegimeState::RiskOff) {
    //         // Close all alt positions
    //     }
    // }
}

void Engine::evaluate_strategies() {
    // TODO: Iterate active strategies, generate signals
    // Each signal goes through risk manager before execution
}

void Engine::reconcile_positions() {
    // TODO: Compare internal state with exchange positions
    // Periodically verify via REST API
}

} // namespace autopilot
