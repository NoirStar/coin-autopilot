#include <gtest/gtest.h>
#include "risk/risk_manager.hpp"
#include "risk/position_sizer.hpp"

using namespace autopilot;

TEST(RiskTest, PositionSizer_QtyCalculation) {
    PositionSizer::Config config;
    config.equity = 10000;
    config.risk_per_trade_pct = 0.30;
    config.stop_atr_mult = 2.7;

    PositionSizer sizer(config);

    // ATR = 100, so stop = 2.7 * 100 = 270
    // Allowed loss = 10000 * 0.003 = 30
    // Qty = 30 / 270 ≈ 0.111
    double qty = sizer.compute_qty(50000, 100);
    EXPECT_NEAR(qty, 0.111, 0.01);
}

TEST(RiskTest, RiskManager_StopPrice) {
    RiskManager::Config config;
    config.stop_atr_mult = 2.7;
    RiskManager rm(config);

    double stop_long = rm.compute_stop_price(100.0, 5.0, Side::Buy);
    EXPECT_NEAR(stop_long, 86.5, 0.01);

    double stop_short = rm.compute_stop_price(100.0, 5.0, Side::Sell);
    EXPECT_NEAR(stop_short, 113.5, 0.01);
}

TEST(RiskTest, RiskManager_DrawdownDetection) {
    RiskManager::Config config;
    config.max_drawdown_pct = 15.0;
    config.drawdown_halt_pct = 25.0;
    RiskManager rm(config);

    rm.update_equity(10000);
    EXPECT_FALSE(rm.check_drawdown());

    rm.update_equity(7400);  // 26% drawdown
    EXPECT_TRUE(rm.check_drawdown());  // Should trigger halt
}

TEST(RiskTest, RiskManager_DailyLoss) {
    RiskManager::Config config;
    config.max_daily_loss_pct = 2.0;
    RiskManager rm(config);

    rm.update_equity(10000);
    rm.record_trade_pnl(-150);
    EXPECT_FALSE(rm.check_daily_loss());

    rm.record_trade_pnl(-60);  // Total: -210 = 2.1%
    EXPECT_TRUE(rm.check_daily_loss());

    rm.reset_daily();
    EXPECT_FALSE(rm.check_daily_loss());
}
