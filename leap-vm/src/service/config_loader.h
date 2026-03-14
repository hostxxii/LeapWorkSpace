#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace leapvm {
namespace service {

class ConfigLoader {
public:
    // Read entire file into string. Returns false on failure.
    static bool ReadFile(const std::string& path, std::string& content_out);

    // Read entire file into byte vector. Returns false on failure.
    static bool ReadFileBytes(const std::string& path, std::vector<uint8_t>& bytes_out);
};

}  // namespace service
}  // namespace leapvm
