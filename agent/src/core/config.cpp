#include "config.hpp"
#include <yaml-cpp/yaml.h>
#include <spdlog/spdlog.h>
#include <stdexcept>

namespace autopilot {

AgentConfig AgentConfig::load(const std::string& filepath) {
    YAML::Node root = YAML::LoadFile(filepath);
    AgentConfig cfg;

    // Agent
    auto agent = root["agent"];
    cfg.agent_id = agent["id"].as<std::string>("autopilot-001");
    cfg.mode = agent["mode"].as<std::string>("paper");
    cfg.log_level = agent["log_level"].as<std::string>("info");

    // gRPC
    auto grpc = root["grpc"];
    cfg.grpc_server_address = grpc["server_address"].as<std::string>("localhost:50051");
    cfg.grpc_use_tls = grpc["use_tls"].as<bool>(false);

    // Upbit
    auto upbit = root["exchanges"]["upbit"];
    cfg.upbit.enabled = upbit["enabled"].as<bool>(false);
    cfg.upbit.api_key = upbit["api_key"].as<std::string>("");
    cfg.upbit.api_secret = upbit["api_secret"].as<std::string>("");
    cfg.upbit.rate_limit_per_second = upbit["rate_limit_per_second"].as<int>(8);
    cfg.upbit.ws_url = upbit["ws_url"].as<std::string>("wss://api.upbit.com/websocket/v1");
    cfg.upbit.rest_url = upbit["rest_url"].as<std::string>("https://api.upbit.com");

    // OKX
    auto okx = root["exchanges"]["okx"];
    cfg.okx.enabled = okx["enabled"].as<bool>(false);
    cfg.okx.api_key = okx["api_key"].as<std::string>("");
    cfg.okx.api_secret = okx["api_secret"].as<std::string>("");
    cfg.okx.passphrase = okx["passphrase"].as<std::string>("");
    cfg.okx.rate_limit_per_second = okx["rate_limit_per_second"].as<int>(20);
    cfg.okx.ws_url = okx["ws_url"].as<std::string>("");
    cfg.okx.ws_private_url = okx["ws_private_url"].as<std::string>("");
    cfg.okx.rest_url = okx["rest_url"].as<std::string>("https://www.okx.com");
    cfg.okx.simulated = okx["simulated"].as<bool>(false);

    // Risk
    auto risk = root["risk"];
    cfg.risk_profile = risk["profile"].as<std::string>("moderate");
    cfg.max_daily_loss_pct = risk["max_daily_loss_pct"].as<double>(2.0);
    cfg.max_single_loss_pct = risk["max_single_loss_pct"].as<double>(0.30);
    cfg.max_drawdown_pct = risk["max_drawdown_pct"].as<double>(15.0);
    cfg.drawdown_halt_pct = risk["drawdown_halt_pct"].as<double>(25.0);
    cfg.max_positions = risk["max_positions"].as<int>(5);
    cfg.max_leverage = risk["max_leverage"].as<double>(2.0);
    cfg.margin_mode = risk["margin_mode"].as<std::string>("isolated");
    cfg.max_margin_usage_pct = risk["max_margin_usage_pct"].as<double>(35.0);

    // Strategies
    if (root["strategies"]) {
        for (const auto& s : root["strategies"]) {
            StrategyParams sp;
            sp.name = s["name"].as<std::string>();
            sp.type = s["type"].as<std::string>();
            sp.enabled = s["enabled"].as<bool>(false);
            if (s["params"]) {
                for (const auto& p : s["params"]) {
                    sp.params[p.first.as<std::string>()] = p.second.as<std::string>();
                }
            }
            cfg.strategies.push_back(std::move(sp));
        }
    }

    // Universe
    auto uni = root["universe"];
    cfg.universe.min_volume_krw = uni["min_volume_krw"].as<double>(5000000000);
    cfg.universe.min_volume_usd = uni["min_volume_usd"].as<double>(10000000);
    cfg.universe.max_spread_bp = uni["max_spread_bp"].as<double>(20);
    if (uni["exclude_patterns"]) {
        for (const auto& p : uni["exclude_patterns"]) {
            cfg.universe.exclude_patterns.push_back(p.as<std::string>());
        }
    }
    cfg.universe.new_listing_exclude_days = uni["new_listing_exclude_days"].as<int>(14);
    auto tier = uni["tier_allocation"];
    cfg.universe.large_cap_pct = tier["large_cap_pct"].as<double>(60);
    cfg.universe.mid_cap_pct = tier["mid_cap_pct"].as<double>(30);
    cfg.universe.small_cap_pct = tier["small_cap_pct"].as<double>(10);

    // Alerts
    auto alerts = root["alerts"];
    if (alerts["telegram"]) {
        cfg.alerts.telegram_enabled = alerts["telegram"]["enabled"].as<bool>(false);
        cfg.alerts.telegram_bot_token = alerts["telegram"]["bot_token"].as<std::string>("");
        cfg.alerts.telegram_chat_id = alerts["telegram"]["chat_id"].as<std::string>("");
    }
    if (alerts["discord"]) {
        cfg.alerts.discord_enabled = alerts["discord"]["enabled"].as<bool>(false);
        cfg.alerts.discord_webhook_url = alerts["discord"]["webhook_url"].as<std::string>("");
    }

    spdlog::info("Config loaded: agent={}, mode={}, risk={}", cfg.agent_id, cfg.mode, cfg.risk_profile);
    return cfg;
}

} // namespace autopilot
