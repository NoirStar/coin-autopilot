cmake_minimum_required(VERSION 3.20)
project(coin-autopilot-agent VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# vcpkg dependencies
find_package(Boost REQUIRED COMPONENTS system)
find_package(OpenSSL REQUIRED)
find_package(spdlog REQUIRED)
find_package(gRPC CONFIG REQUIRED)
find_package(Protobuf REQUIRED)
find_package(yaml-cpp REQUIRED)

# simdjson (header-only or vcpkg)
find_package(simdjson CONFIG REQUIRED)

# Proto generation
set(PROTO_DIR "${CMAKE_SOURCE_DIR}/../proto")
set(PROTO_SRC "${PROTO_DIR}/autopilot.proto")
set(PROTO_GEN_DIR "${CMAKE_BINARY_DIR}/generated")
file(MAKE_DIRECTORY ${PROTO_GEN_DIR})

add_custom_command(
  OUTPUT
    "${PROTO_GEN_DIR}/autopilot.pb.cc"
    "${PROTO_GEN_DIR}/autopilot.pb.h"
    "${PROTO_GEN_DIR}/autopilot.grpc.pb.cc"
    "${PROTO_GEN_DIR}/autopilot.grpc.pb.h"
  COMMAND protobuf::protoc
    --proto_path=${PROTO_DIR}
    --cpp_out=${PROTO_GEN_DIR}
    --grpc_out=${PROTO_GEN_DIR}
    --plugin=protoc-gen-grpc=$<TARGET_FILE:gRPC::grpc_cpp_plugin>
    ${PROTO_SRC}
  DEPENDS ${PROTO_SRC}
  COMMENT "Generating protobuf/gRPC C++ sources"
)

add_library(proto_lib STATIC
  ${PROTO_GEN_DIR}/autopilot.pb.cc
  ${PROTO_GEN_DIR}/autopilot.grpc.pb.cc
)
target_include_directories(proto_lib PUBLIC ${PROTO_GEN_DIR})
target_link_libraries(proto_lib PUBLIC
  protobuf::libprotobuf
  gRPC::grpc++
)

# Main agent executable
add_executable(agent
  src/main.cpp
  src/core/engine.cpp
  src/core/config.cpp
  src/exchange/upbit/upbit_client.cpp
  src/exchange/upbit/upbit_ws.cpp
  src/exchange/upbit/upbit_auth.cpp
  src/exchange/okx/okx_client.cpp
  src/exchange/okx/okx_ws.cpp
  src/exchange/okx/okx_auth.cpp
  src/strategy/btc_regime_filter.cpp
  src/strategy/alt_mean_reversion.cpp
  src/strategy/dominance_rotation.cpp
  src/strategy/volatility_timing.cpp
  src/strategy/funding_arbitrage.cpp
  src/indicator/indicator_engine.cpp
  src/risk/risk_manager.cpp
  src/risk/position_sizer.cpp
  src/order/order_manager.cpp
  src/data/market_data.cpp
  src/data/candle_store.cpp
  src/comm/grpc_reporter.cpp
)

target_include_directories(agent PRIVATE
  ${CMAKE_SOURCE_DIR}/src
  ${PROTO_GEN_DIR}
)

target_link_libraries(agent PRIVATE
  proto_lib
  Boost::system
  OpenSSL::SSL
  OpenSSL::Crypto
  spdlog::spdlog
  simdjson::simdjson
  yaml-cpp::yaml-cpp
  gRPC::grpc++
)

# Tests
enable_testing()
find_package(GTest CONFIG REQUIRED)

add_executable(agent_tests
  tests/test_indicators.cpp
  tests/test_strategies.cpp
  tests/test_risk.cpp
  src/indicator/indicator_engine.cpp
  src/risk/risk_manager.cpp
  src/risk/position_sizer.cpp
)

target_include_directories(agent_tests PRIVATE
  ${CMAKE_SOURCE_DIR}/src
)

target_link_libraries(agent_tests PRIVATE
  GTest::gtest_main
  spdlog::spdlog
)

include(GoogleTest)
gtest_discover_tests(agent_tests)
