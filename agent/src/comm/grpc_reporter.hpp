#pragma once
#include <string>
namespace autopilot {
class GrpcReporter {
public:
    explicit GrpcReporter(const std::string& server_address, bool use_tls = false);
    // TODO: Stream agent status, trades, positions to monitoring server
    void start();
    void stop();
    void report_status();
    void report_trade();
    void report_regime();
};
} // namespace autopilot
