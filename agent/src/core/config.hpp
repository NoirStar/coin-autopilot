#pragma once

#include <string>
#include <vector>
#include <map>

namespace autopilot {

struct ExchangeConfig {
    bool enabled;
    std::string api_key;
    std::string api_secret;
    std::string passphrase;     // OKX only
    int rate_limit_per_second;
    std::string ws_url;
    std::string ws_private_url; // OKX only
    std::string rest_url;
    bool simulated;             // OKX demo
};

struct StrategyParams {
    std::string name;
    std::string type;
    bool enabled;
    std::map<std::string, std::string> params;
};

struct UniverseConfig {
    double min_volume_krw;
    double min_volume_usd;
    double max_spread_bp;
    std::vector<std::string> exclude_patterns;
    int new_listing_exclude_days;
    double large_cap_pct;
    double mid_cap_pct;
    double small_cap_pct;
};

struct AlertConfig {
    bool telegram_enabled;
    std::string telegram_bot_token;
    std::string telegram_chat_id;
    bool discord_enabled;
    std::string discord_webhook_url;
};

struct AgentConfig {
    // Agent
    std::string agent_id;
    std::string mode;           // "paper" | "live"
    std::string log_level;

    // gRPC
    std::string grpc_server_address;
    bool grpc_use_tls;

    // Exchanges
    ExchangeConfig upbit;
    ExchangeConfig okx;

    // Risk
    std::string risk_profile;
    double max_daily_loss_pct;
    double max_single_loss_pct;
    double max_drawdown_pct;
    double drawdown_halt_pct;
    int max_positions;
    double max_leverage;
    std::string margin_mode;
    double max_margin_usage_pct;

    // Strategies
    std::vector<StrategyParams> strategies;

    // Universe
    UniverseConfig universe;

    // Alerts
    AlertConfig alerts;

    // Load from YAML file
    static AgentConfig load(const std::string& filepath);
};

} // namespace autopilot
