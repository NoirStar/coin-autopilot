#include "core/engine.hpp"
#include "core/config.hpp"
#include <spdlog/spdlog.h>
#include <spdlog/sinks/stdout_color_sinks.h>
#include <spdlog/sinks/rotating_file_sink.h>
#include <csignal>
#include <atomic>
#include <iostream>

static std::atomic<bool> g_shutdown{false};

void signal_handler(int signal) {
    spdlog::info("Signal {} received, shutting down...", signal);
    g_shutdown.store(true);
}

void setup_logging(const std::string& level) {
    auto console_sink = std::make_shared<spdlog::sinks::stdout_color_sink_mt>();
    auto file_sink = std::make_shared<spdlog::sinks::rotating_file_sink_mt>(
        "logs/agent.log", 1024 * 1024 * 10, 5);

    auto logger = std::make_shared<spdlog::logger>(
        "agent", spdlog::sinks_init_list{console_sink, file_sink});

    if (level == "trace") logger->set_level(spdlog::level::trace);
    else if (level == "debug") logger->set_level(spdlog::level::debug);
    else if (level == "warn") logger->set_level(spdlog::level::warn);
    else if (level == "error") logger->set_level(spdlog::level::err);
    else logger->set_level(spdlog::level::info);

    spdlog::set_default_logger(logger);
    spdlog::flush_every(std::chrono::seconds(3));
}

int main(int argc, char* argv[]) {
    // Parse config path
    std::string config_path = "config/config.yaml";
    if (argc > 1) {
        config_path = argv[1];
    }

    try {
        // Load configuration
        auto config = autopilot::AgentConfig::load(config_path);

        // Setup logging
        setup_logging(config.log_level);

        spdlog::info("===========================================");
        spdlog::info("  Coin Autopilot Agent v0.1.0");
        spdlog::info("  Mode: {}", config.mode);
        spdlog::info("  Risk Profile: {}", config.risk_profile);
        spdlog::info("  Upbit: {}", config.upbit.enabled ? "enabled" : "disabled");
        spdlog::info("  OKX: {}", config.okx.enabled ? "enabled" : "disabled");
        spdlog::info("  Strategies: {}", config.strategies.size());
        spdlog::info("===========================================");

        // Register signal handlers
        std::signal(SIGINT, signal_handler);
        std::signal(SIGTERM, signal_handler);

        // Create and start engine
        autopilot::Engine engine(config);
        engine.start();

        // Wait for shutdown signal
        while (!g_shutdown.load()) {
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
            if (!engine.is_running()) break;
        }

        engine.stop();
        spdlog::info("Agent shutdown complete");

    } catch (const std::exception& e) {
        std::cerr << "Fatal error: " << e.what() << std::endl;
        return 1;
    }

    return 0;
}
