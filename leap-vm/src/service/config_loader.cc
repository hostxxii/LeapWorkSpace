#include "config_loader.h"
#include "log.h"

#include <fstream>
#include <sstream>

namespace leapvm {
namespace service {

bool ConfigLoader::ReadFile(const std::string& path, std::string& content_out) {
    std::ifstream file(path, std::ios::in | std::ios::binary);
    if (!file.is_open()) {
        LEAPVM_LOG_ERROR("ConfigLoader: cannot open file: %s", path.c_str());
        return false;
    }

    std::ostringstream ss;
    ss << file.rdbuf();
    if (file.bad()) {
        LEAPVM_LOG_ERROR("ConfigLoader: read error on file: %s", path.c_str());
        return false;
    }

    content_out = ss.str();
    return true;
}

bool ConfigLoader::ReadFileBytes(const std::string& path, std::vector<uint8_t>& bytes_out) {
    std::ifstream file(path, std::ios::in | std::ios::binary | std::ios::ate);
    if (!file.is_open()) {
        LEAPVM_LOG_ERROR("ConfigLoader: cannot open file: %s", path.c_str());
        return false;
    }

    auto size = file.tellg();
    file.seekg(0, std::ios::beg);
    bytes_out.resize(static_cast<size_t>(size));
    file.read(reinterpret_cast<char*>(bytes_out.data()), size);

    if (file.bad()) {
        LEAPVM_LOG_ERROR("ConfigLoader: read error on file: %s", path.c_str());
        return false;
    }

    return true;
}

}  // namespace service
}  // namespace leapvm
