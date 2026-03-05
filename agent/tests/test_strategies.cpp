#include <gtest/gtest.h>
#include "strategy/alt_mean_reversion.hpp"

using namespace autopilot;

TEST(StrategyTest, MeanReversion_NoSignalInRiskOff) {
    AltMeanReversionStrategy strategy;
    strategy.set_enabled(true);

    RegimeInfo regime;
    regime.state = RegimeState::RiskOff;

    std::vector<AltZScore> scores = {{
        .symbol = "ETH",
        .ratio = -0.5,
        .z_score = -2.0,
        .rsi = 40,
        .atr = 100,
        .spread_bp = 5
    }};

    auto signals = strategy.evaluate(regime, scores, {});
    EXPECT_TRUE(signals.empty());  // No signals in Risk-Off
}

TEST(StrategyTest, MeanReversion_SignalInRiskOn) {
    AltMeanReversionStrategy strategy;
    strategy.set_enabled(true);

    RegimeInfo regime;
    regime.state = RegimeState::RiskOn;

    std::vector<AltZScore> scores = {{
        .symbol = "ETH",
        .ratio = -0.5,
        .z_score = -1.5,
        .rsi = 45,
        .atr = 100,
        .spread_bp = 10
    }};

    auto signals = strategy.evaluate(regime, scores, {});
    EXPECT_EQ(signals.size(), 1);
    EXPECT_EQ(signals[0].symbol, "ETH");
    EXPECT_EQ(signals[0].side, Side::Buy);
}

TEST(StrategyTest, MeanReversion_CloseOnRegimeStop) {
    AltMeanReversionStrategy strategy;

    Position pos;
    pos.symbol = "ETH";
    pos.bars_held = 2;

    RegimeInfo regime;
    regime.state = RegimeState::RiskOff;

    AltZScore score;
    score.z_score = -0.5;

    EXPECT_TRUE(strategy.should_close(pos, regime, score));
}

TEST(StrategyTest, MeanReversion_CloseOnTakeProfit) {
    AltMeanReversionStrategy strategy;

    Position pos;
    pos.symbol = "ETH";
    pos.bars_held = 2;

    RegimeInfo regime;
    regime.state = RegimeState::RiskOn;

    AltZScore score;
    score.z_score = 0.5;  // Above exit threshold

    EXPECT_TRUE(strategy.should_close(pos, regime, score));
}
