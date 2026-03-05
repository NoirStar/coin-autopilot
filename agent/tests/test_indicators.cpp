#include <gtest/gtest.h>
#include "indicator/indicator_engine.hpp"
#include <deque>

using namespace autopilot;

TEST(IndicatorTest, EMA_BasicCalculation) {
    std::deque<double> prices = {10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20};
    double result = IndicatorEngine::ema(prices, 5);
    EXPECT_GT(result, 0);
    EXPECT_NEAR(result, 18.7, 1.0);  // Approximate
}

TEST(IndicatorTest, RSI_OverboughtOversold) {
    // Rising prices → RSI should be high
    std::deque<double> rising;
    for (int i = 0; i < 20; ++i) rising.push_back(100 + i * 2);
    double rsi_up = IndicatorEngine::rsi(rising, 14);
    EXPECT_GT(rsi_up, 70);

    // Falling prices → RSI should be low
    std::deque<double> falling;
    for (int i = 0; i < 20; ++i) falling.push_back(200 - i * 2);
    double rsi_down = IndicatorEngine::rsi(falling, 14);
    EXPECT_LT(rsi_down, 30);
}

TEST(IndicatorTest, ATR_Calculation) {
    std::deque<Candle> candles;
    for (int i = 0; i < 20; ++i) {
        candles.push_back({
            .open_time_ms = i * 14400000LL,
            .open = 100.0 + i,
            .high = 105.0 + i,
            .low = 95.0 + i,
            .close = 102.0 + i,
            .volume = 1000
        });
    }
    double atr_val = IndicatorEngine::atr(candles, 14);
    EXPECT_GT(atr_val, 0);
    EXPECT_LT(atr_val, 15);
}

TEST(IndicatorTest, ZScore_Calculation) {
    std::deque<double> values;
    for (int i = 0; i < 25; ++i) values.push_back(100.0);
    values.push_back(80.0);  // Obvious outlier below

    double z = IndicatorEngine::zscore(values, 20);
    EXPECT_LT(z, -1.0);  // Should be significantly negative
}

TEST(IndicatorTest, SMA_Calculation) {
    std::deque<double> values = {1, 2, 3, 4, 5};
    double result = IndicatorEngine::sma(values, 5);
    EXPECT_DOUBLE_EQ(result, 3.0);
}
