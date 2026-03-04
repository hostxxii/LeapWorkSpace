#include "dom_core.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <functional>
#include <limits>
#include <optional>
#include <sstream>
#include <string>
#include <vector>

namespace leapvm {
namespace dom {
namespace {

inline bool IsAsciiSpace(char ch) {
    return ch == ' ' || ch == '\n' || ch == '\r' || ch == '\t' || ch == '\f' || ch == '\v';
}

std::string ToLowerAscii(const std::string& input) {
    std::string out = input;
    std::transform(out.begin(), out.end(), out.begin(), [](unsigned char ch) {
        return static_cast<char>(std::tolower(ch));
    });
    return out;
}

std::string ToUpperAscii(const std::string& input) {
    std::string out = input;
    std::transform(out.begin(), out.end(), out.begin(), [](unsigned char ch) {
        return static_cast<char>(std::toupper(ch));
    });
    return out;
}

void TrimAscii(std::string* input) {
    if (!input) {
        return;
    }
    size_t begin = 0;
    size_t end = input->size();
    while (begin < end && IsAsciiSpace((*input)[begin])) {
        ++begin;
    }
    while (end > begin && IsAsciiSpace((*input)[end - 1])) {
        --end;
    }
    if (begin == 0 && end == input->size()) {
        return;
    }
    *input = input->substr(begin, end - begin);
}

bool IsVoidTag(const std::string& tag_name) {
    static const std::unordered_set<std::string> kVoidTags = {
        "area", "base", "br", "col", "embed", "hr", "img", "input",
        "link", "meta", "param", "source", "track", "wbr"
    };
    return kVoidTags.find(ToLowerAscii(tag_name)) != kVoidTags.end();
}

std::string SerializeStyleMap(const std::unordered_map<std::string, std::string>& style_map) {
    if (style_map.empty()) {
        return std::string();
    }
    std::ostringstream oss;
    bool first = true;
    for (const auto& entry : style_map) {
        if (!first) {
            oss << ' ';
        }
        first = false;
        oss << entry.first << ": " << entry.second << ';';
    }
    return oss.str();
}

bool ParseStyleDeclarations(const std::string& style_text,
                            std::unordered_map<std::string, std::string>* out_style_map) {
    if (!out_style_map) {
        return false;
    }

    size_t pos = 0;
    while (pos < style_text.size()) {
        size_t semi = style_text.find(';', pos);
        size_t end = (semi == std::string::npos) ? style_text.size() : semi;
        std::string decl = style_text.substr(pos, end - pos);
        TrimAscii(&decl);
        if (!decl.empty()) {
            size_t colon = decl.find(':');
            if (colon != std::string::npos) {
                std::string name = decl.substr(0, colon);
                std::string value = decl.substr(colon + 1);
                TrimAscii(&name);
                TrimAscii(&value);
                if (!name.empty()) {
                    (*out_style_map)[ToLowerAscii(name)] = value;
                }
            }
        }
        if (semi == std::string::npos) {
            break;
        }
        pos = semi + 1;
    }

    return true;
}

}  // namespace

uint64_t DomManager::MakeHandleKey(uint32_t doc_id, uint32_t node_id) {
    return (static_cast<uint64_t>(doc_id) << 32U) | static_cast<uint64_t>(node_id);
}

std::string DomManager::NormalizeCssName(const std::string& input) {
    std::string out;
    out.reserve(input.size() + 8);

    for (char raw : input) {
        unsigned char ch = static_cast<unsigned char>(raw);
        if (std::isspace(ch)) {
            continue;
        }
        if (std::isupper(ch)) {
            if (!out.empty()) {
                out.push_back('-');
            }
            out.push_back(static_cast<char>(std::tolower(ch)));
            continue;
        }
        out.push_back(static_cast<char>(std::tolower(ch)));
    }

    TrimAscii(&out);
    return out;
}

double DomManager::ParsePixels(const std::string& input) {
    std::string text = input;
    TrimAscii(&text);
    if (text.empty()) {
        return std::numeric_limits<double>::quiet_NaN();
    }

    const std::string lowered = ToLowerAscii(text);
    if (lowered == "auto") {
        return std::numeric_limits<double>::quiet_NaN();
    }

    if (text.size() >= 2) {
        const std::string suffix = ToLowerAscii(text.substr(text.size() - 2));
        if (suffix == "px") {
            text.resize(text.size() - 2);
            TrimAscii(&text);
        }
    }

    if (text.empty() || text.find('%') != std::string::npos) {
        return std::numeric_limits<double>::quiet_NaN();
    }

    char* end_ptr = nullptr;
    const double parsed = std::strtod(text.c_str(), &end_ptr);
    if (!std::isfinite(parsed) || !end_ptr || end_ptr == text.c_str()) {
        return std::numeric_limits<double>::quiet_NaN();
    }
    while (*end_ptr != '\0') {
        if (!std::isspace(static_cast<unsigned char>(*end_ptr))) {
            return std::numeric_limits<double>::quiet_NaN();
        }
        ++end_ptr;
    }
    return parsed;
}

DomManager::DomDocument* DomManager::FindDocument(uint32_t doc_id) {
    auto it = documents_.find(doc_id);
    if (it == documents_.end()) {
        return nullptr;
    }
    return &it->second;
}

const DomManager::DomDocument* DomManager::FindDocument(uint32_t doc_id) const {
    auto it = documents_.find(doc_id);
    if (it == documents_.end()) {
        return nullptr;
    }
    return &it->second;
}

DomManager::DomNode* DomManager::ResolveNode(DomDocument* doc, const NodeHandle& handle) {
    if (!doc || handle.doc_id != doc->id) {
        return nullptr;
    }

    auto node_it = doc->nodes.find(handle.node_id);
    if (node_it == doc->nodes.end()) {
        return nullptr;
    }
    if (node_it->second.generation != handle.generation) {
        return nullptr;
    }

    auto handle_it = handle_table_.find(MakeHandleKey(handle.doc_id, handle.node_id));
    if (handle_it == handle_table_.end() || handle_it->second != handle.generation) {
        return nullptr;
    }

    return &node_it->second;
}

const DomManager::DomNode* DomManager::ResolveNode(
    const DomDocument* doc,
    const NodeHandle& handle) const {
    if (!doc || handle.doc_id != doc->id) {
        return nullptr;
    }

    auto node_it = doc->nodes.find(handle.node_id);
    if (node_it == doc->nodes.end()) {
        return nullptr;
    }
    if (node_it->second.generation != handle.generation) {
        return nullptr;
    }

    auto handle_it = handle_table_.find(MakeHandleKey(handle.doc_id, handle.node_id));
    if (handle_it == handle_table_.end() || handle_it->second != handle.generation) {
        return nullptr;
    }

    return &node_it->second;
}

std::optional<uint32_t> DomManager::ResolveParentId(
    DomDocument* doc,
    const std::optional<NodeHandle>& parent_handle) const {
    if (!doc) {
        return std::nullopt;
    }
    if (!parent_handle.has_value()) {
        return static_cast<uint32_t>(0);
    }
    const DomNode* parent = ResolveNode(doc, parent_handle.value());
    if (!parent) {
        return std::nullopt;
    }
    return parent->id;
}

bool DomManager::IsAncestor(const DomDocument* doc, uint32_t ancestor_id, uint32_t target_id) const {
    if (!doc || ancestor_id == 0 || target_id == 0) {
        return false;
    }

    uint32_t current = target_id;
    while (current != 0) {
        if (current == ancestor_id) {
            return true;
        }
        auto it = doc->nodes.find(current);
        if (it == doc->nodes.end()) {
            break;
        }
        current = it->second.parent_id;
    }

    return false;
}

void DomManager::DetachFromParent(DomDocument* doc, DomNode* node) {
    if (!doc || !node) {
        return;
    }

    if (node->parent_id == 0) {
        auto it = std::find(doc->roots.begin(), doc->roots.end(), node->id);
        if (it != doc->roots.end()) {
            doc->roots.erase(it);
        }
    } else {
        auto parent_it = doc->nodes.find(node->parent_id);
        if (parent_it != doc->nodes.end()) {
            auto& children = parent_it->second.children;
            auto child_it = std::find(children.begin(), children.end(), node->id);
            if (child_it != children.end()) {
                children.erase(child_it);
            }
        }
    }

    node->parent_id = 0;
}

void DomManager::ReleaseNodeSubtree(DomDocument* doc, uint32_t node_id) {
    if (!doc || node_id == 0) {
        return;
    }

    auto node_it = doc->nodes.find(node_id);
    if (node_it == doc->nodes.end()) {
        return;
    }

    const std::vector<uint32_t> children_copy = node_it->second.children;
    for (uint32_t child_id : children_copy) {
        ReleaseNodeSubtree(doc, child_id);
    }

    handle_table_.erase(MakeHandleKey(doc->id, node_it->second.id));
    doc->nodes.erase(node_it);
}

uint32_t DomManager::CreateDocument(const std::string& task_id) {
    const uint32_t doc_id = next_doc_id_++;

    DomDocument doc;
    doc.id = doc_id;
    doc.task_id = task_id.empty() ? "task-default" : task_id;

    documents_.emplace(doc_id, std::move(doc));
    task_scope_docs_[task_id.empty() ? "task-default" : task_id].insert(doc_id);
    return doc_id;
}

bool DomManager::ReleaseDocument(uint32_t doc_id) {
    DomDocument* doc = FindDocument(doc_id);
    if (!doc) {
        return false;
    }

    const std::vector<uint32_t> roots_copy = doc->roots;
    for (uint32_t root_id : roots_copy) {
        ReleaseNodeSubtree(doc, root_id);
    }

    for (const auto& entry : doc->nodes) {
        handle_table_.erase(MakeHandleKey(doc->id, entry.first));
    }

    auto scope_it = task_scope_docs_.find(doc->task_id);
    if (scope_it != task_scope_docs_.end()) {
        scope_it->second.erase(doc_id);
        if (scope_it->second.empty()) {
            task_scope_docs_.erase(scope_it);
        }
    }

    documents_.erase(doc_id);
    return true;
}

size_t DomManager::ReleaseTaskScope(const std::string& task_id) {
    const std::string key = task_id.empty() ? "task-default" : task_id;
    auto it = task_scope_docs_.find(key);
    if (it == task_scope_docs_.end()) {
        return 0;
    }

    const std::vector<uint32_t> doc_ids(it->second.begin(), it->second.end());
    size_t released = 0;
    for (uint32_t doc_id : doc_ids) {
        if (ReleaseDocument(doc_id)) {
            ++released;
        }
    }

    task_scope_docs_.erase(key);
    return released;
}

bool DomManager::CreateElement(uint32_t doc_id, const std::string& tag_name, NodeHandle* out_handle) {
    DomDocument* doc = FindDocument(doc_id);
    if (!doc || !out_handle) {
        return false;
    }

    DomNode node;
    node.id = doc->next_node_id++;
    node.generation = 1;
    node.tag_name = ToUpperAscii(tag_name.empty() ? "DIV" : tag_name);

    doc->nodes.emplace(node.id, std::move(node));
    handle_table_[MakeHandleKey(doc_id, doc->next_node_id - 1)] = 1;

    out_handle->doc_id = doc_id;
    out_handle->node_id = doc->next_node_id - 1;
    out_handle->generation = 1;
    return true;
}

bool DomManager::AppendChild(uint32_t doc_id,
                             const std::optional<NodeHandle>& parent_handle,
                             const NodeHandle& child_handle) {
    DomDocument* doc = FindDocument(doc_id);
    if (!doc) {
        return false;
    }

    DomNode* child = ResolveNode(doc, child_handle);
    if (!child) {
        return false;
    }

    const std::optional<uint32_t> parent_id_opt = ResolveParentId(doc, parent_handle);
    if (!parent_id_opt.has_value()) {
        return false;
    }

    const uint32_t parent_id = parent_id_opt.value();
    if (parent_id == child->id) {
        return false;
    }

    DomNode* parent = nullptr;
    if (parent_id != 0) {
        auto parent_it = doc->nodes.find(parent_id);
        if (parent_it == doc->nodes.end()) {
            return false;
        }
        parent = &parent_it->second;
        if (IsAncestor(doc, child->id, parent_id)) {
            return false;
        }
    }

    DetachFromParent(doc, child);
    child->parent_id = parent_id;
    child->layout_dirty = true;

    if (parent) {
        parent->children.push_back(child->id);
        parent->layout_dirty = true;
    } else {
        if (std::find(doc->roots.begin(), doc->roots.end(), child->id) == doc->roots.end()) {
            doc->roots.push_back(child->id);
        }
    }

    return true;
}

bool DomManager::RemoveChild(uint32_t doc_id,
                             const std::optional<NodeHandle>& parent_handle,
                             const NodeHandle& child_handle) {
    DomDocument* doc = FindDocument(doc_id);
    if (!doc) {
        return false;
    }

    DomNode* child = ResolveNode(doc, child_handle);
    if (!child) {
        return false;
    }

    if (parent_handle.has_value()) {
        const std::optional<uint32_t> parent_id_opt = ResolveParentId(doc, parent_handle);
        if (!parent_id_opt.has_value()) {
            return false;
        }
        if (child->parent_id != parent_id_opt.value()) {
            return false;
        }
    }

    DetachFromParent(doc, child);
    child->layout_dirty = true;
    return true;
}

bool DomManager::SetStyle(uint32_t doc_id,
                          const NodeHandle& handle,
                          const std::string& name,
                          const std::string& value) {
    return SetStyleNormalized(doc_id, handle, NormalizeCssName(name), value);
}

bool DomManager::SetStyleNormalized(uint32_t doc_id,
                                    const NodeHandle& handle,
                                    const std::string& normalized_name,
                                    const std::string& normalized_value) {
    DomDocument* doc = FindDocument(doc_id);
    if (!doc) {
        return false;
    }

    DomNode* node = ResolveNode(doc, handle);
    if (!node) {
        return false;
    }

    std::string key = NormalizeCssName(normalized_name);
    std::string value = normalized_value;
    TrimAscii(&value);
    if (key.empty()) {
        return false;
    }

    node->style_map[key] = value;
    node->layout_dirty = true;
    return true;
}

bool DomManager::SetStylePacked(uint32_t doc_id,
                                const NodeHandle& handle,
                                uint32_t style_code,
                                int32_t packed_value) {
    switch (style_code) {
    case 1: {
        std::string value;
        switch (packed_value) {
        case 1:
            value = "relative";
            break;
        case 2:
            value = "absolute";
            break;
        case 3:
            value = "static";
            break;
        case 4:
            value = "fixed";
            break;
        default:
            return false;
        }
        return SetStyleNormalized(doc_id, handle, "position", value);
    }
    case 2:
        return SetStyleNormalized(doc_id, handle, "left", std::to_string(packed_value) + "px");
    case 3:
        return SetStyleNormalized(doc_id, handle, "top", std::to_string(packed_value) + "px");
    case 4:
        return SetStyleNormalized(doc_id, handle, "width", std::to_string(std::max(0, packed_value)) + "px");
    case 5:
        return SetStyleNormalized(doc_id, handle, "height", std::to_string(std::max(0, packed_value)) + "px");
    default:
        return false;
    }
}

LayoutRect DomManager::ComputeLayoutRect(const DomNode& node) const {
    LayoutRect rect;

    auto read = [&](const char* key, double fallback) -> double {
        auto it = node.style_map.find(key);
        if (it == node.style_map.end()) {
            return fallback;
        }
        const double parsed = ParsePixels(it->second);
        if (!std::isfinite(parsed)) {
            return fallback;
        }
        return parsed;
    };

    rect.x = read("left", 0.0);
    rect.y = read("top", 0.0);
    rect.width = std::max(0.0, read("width", 0.0));
    rect.height = std::max(0.0, read("height", 0.0));

    auto display_it = node.style_map.find("display");
    if (display_it != node.style_map.end() && ToLowerAscii(display_it->second) == "none") {
        rect.width = 0.0;
        rect.height = 0.0;
    }

    return rect;
}

bool DomManager::GetLayoutRect(uint32_t doc_id, const NodeHandle& handle, LayoutRect* out_rect) {
    DomDocument* doc = FindDocument(doc_id);
    if (!doc || !out_rect) {
        return false;
    }

    DomNode* node = ResolveNode(doc, handle);
    if (!node) {
        return false;
    }

    *out_rect = ComputeLayoutRect(*node);
    return true;
}

bool DomManager::ParseHTMLIntoDocument(uint32_t doc_id, const std::string& html_text) {
    DomDocument* doc = FindDocument(doc_id);
    if (!doc) {
        return false;
    }

    for (const auto& entry : doc->nodes) {
        handle_table_.erase(MakeHandleKey(doc_id, entry.first));
    }
    doc->nodes.clear();
    doc->roots.clear();
    doc->next_node_id = 1;

    std::vector<uint32_t> stack;

    auto append_new_node = [&](const std::string& tag_name,
                               bool self_closing,
                               const std::unordered_map<std::string, std::string>& attrs,
                               const std::unordered_map<std::string, std::string>& styles) {
        DomNode node;
        node.id = doc->next_node_id++;
        node.generation = 1;
        node.tag_name = ToUpperAscii(tag_name.empty() ? "DIV" : tag_name);
        node.attrs = attrs;
        node.style_map = styles;

        const uint32_t node_id = node.id;
        doc->nodes.emplace(node_id, std::move(node));
        handle_table_[MakeHandleKey(doc_id, node_id)] = 1;

        if (!stack.empty()) {
            auto parent_it = doc->nodes.find(stack.back());
            if (parent_it != doc->nodes.end()) {
                parent_it->second.children.push_back(node_id);
                doc->nodes[node_id].parent_id = parent_it->second.id;
            } else {
                doc->roots.push_back(node_id);
            }
        } else {
            doc->roots.push_back(node_id);
        }

        if (!self_closing && !IsVoidTag(tag_name)) {
            stack.push_back(node_id);
        }
    };

    size_t pos = 0;
    while (pos < html_text.size()) {
        const size_t lt = html_text.find('<', pos);
        if (lt == std::string::npos) {
            break;
        }
        const size_t gt = html_text.find('>', lt + 1);
        if (gt == std::string::npos) {
            break;
        }

        std::string token = html_text.substr(lt + 1, gt - lt - 1);
        TrimAscii(&token);
        pos = gt + 1;

        if (token.empty()) {
            continue;
        }
        if (token[0] == '!') {
            continue;
        }

        bool closing = false;
        if (token[0] == '/') {
            closing = true;
            token.erase(token.begin());
            TrimAscii(&token);
        }

        if (closing) {
            if (!stack.empty()) {
                stack.pop_back();
            }
            continue;
        }

        bool self_closing = false;
        if (!token.empty() && token.back() == '/') {
            self_closing = true;
            token.pop_back();
            TrimAscii(&token);
        }

        size_t split = 0;
        while (split < token.size() && !IsAsciiSpace(token[split])) {
            ++split;
        }

        std::string tag_name = token.substr(0, split);
        TrimAscii(&tag_name);
        if (tag_name.empty()) {
            continue;
        }

        std::unordered_map<std::string, std::string> attrs;
        std::unordered_map<std::string, std::string> styles;

        size_t off = split;
        while (off < token.size()) {
            while (off < token.size() && IsAsciiSpace(token[off])) {
                ++off;
            }
            if (off >= token.size()) {
                break;
            }

            size_t name_start = off;
            while (off < token.size() &&
                   !IsAsciiSpace(token[off]) &&
                   token[off] != '=') {
                ++off;
            }
            std::string attr_name = token.substr(name_start, off - name_start);
            TrimAscii(&attr_name);
            if (attr_name.empty()) {
                break;
            }
            attr_name = ToLowerAscii(attr_name);

            while (off < token.size() && IsAsciiSpace(token[off])) {
                ++off;
            }

            std::string attr_value;
            if (off < token.size() && token[off] == '=') {
                ++off;
                while (off < token.size() && IsAsciiSpace(token[off])) {
                    ++off;
                }
                if (off < token.size() && (token[off] == '"' || token[off] == '\'')) {
                    char quote = token[off++];
                    size_t value_start = off;
                    while (off < token.size() && token[off] != quote) {
                        ++off;
                    }
                    attr_value = token.substr(value_start, off - value_start);
                    if (off < token.size() && token[off] == quote) {
                        ++off;
                    }
                } else {
                    size_t value_start = off;
                    while (off < token.size() && !IsAsciiSpace(token[off])) {
                        ++off;
                    }
                    attr_value = token.substr(value_start, off - value_start);
                }
                TrimAscii(&attr_value);
            }

            attrs[attr_name] = attr_value;
            if (attr_name == "style" && !attr_value.empty()) {
                ParseStyleDeclarations(attr_value, &styles);
            }
        }

        append_new_node(tag_name, self_closing, attrs, styles);
    }

    if (doc->roots.empty()) {
        std::unordered_map<std::string, std::string> attrs;
        std::unordered_map<std::string, std::string> styles;
        append_new_node("html", false, attrs, styles);
    }

    return true;
}

bool DomManager::BuildSnapshotNode(const DomDocument* doc,
                                   uint32_t node_id,
                                   const std::string& parent_path,
                                   TraceSnapshotNode* out_snapshot) const {
    if (!doc || !out_snapshot) {
        return false;
    }

    auto it = doc->nodes.find(node_id);
    if (it == doc->nodes.end()) {
        return false;
    }

    const DomNode& node = it->second;
    out_snapshot->node_type = 1;
    out_snapshot->node_name = node.tag_name;
    out_snapshot->tag_name = node.tag_name;
    out_snapshot->id.clear();
    out_snapshot->class_name.clear();
    out_snapshot->text_content.clear();
    out_snapshot->path = parent_path.empty()
        ? ("/" + ToLowerAscii(node.tag_name))
        : (parent_path + "/" + ToLowerAscii(node.tag_name));
    out_snapshot->rect = ComputeLayoutRect(node);
    out_snapshot->attrs = node.attrs;

    auto id_it = node.attrs.find("id");
    if (id_it != node.attrs.end()) {
        out_snapshot->id = id_it->second;
    }

    auto class_it = node.attrs.find("class");
    if (class_it != node.attrs.end()) {
        out_snapshot->class_name = class_it->second;
    }

    const std::string style_text = SerializeStyleMap(node.style_map);
    if (!style_text.empty()) {
        out_snapshot->attrs["style"] = style_text;
    }

    out_snapshot->children.clear();
    out_snapshot->children.reserve(node.children.size());
    for (uint32_t child_id : node.children) {
        TraceSnapshotNode child_snapshot;
        if (BuildSnapshotNode(doc, child_id, out_snapshot->path, &child_snapshot)) {
            out_snapshot->children.push_back(std::move(child_snapshot));
        }
    }

    return true;
}

bool DomManager::SnapshotDocument(uint32_t doc_id, TraceSnapshotNode* out_snapshot) {
    const DomDocument* doc = FindDocument(doc_id);
    if (!doc || !out_snapshot) {
        return false;
    }

    out_snapshot->node_type = 9;
    out_snapshot->node_name = "#document";
    out_snapshot->tag_name.clear();
    out_snapshot->id.clear();
    out_snapshot->class_name.clear();
    out_snapshot->text_content.clear();
    out_snapshot->path = "/";
    out_snapshot->rect = LayoutRect{};
    out_snapshot->attrs.clear();
    out_snapshot->children.clear();
    out_snapshot->children.reserve(doc->roots.size());

    for (uint32_t root_id : doc->roots) {
        TraceSnapshotNode child_snapshot;
        if (BuildSnapshotNode(doc, root_id, std::string(), &child_snapshot)) {
            out_snapshot->children.push_back(std::move(child_snapshot));
        }
    }

    return true;
}

std::vector<uint32_t> DomManager::GetAllElementIds(uint32_t doc_id) const {
    const DomDocument* doc = FindDocument(doc_id);
    if (!doc) {
        return {};
    }

    std::vector<uint32_t> result;
    result.reserve(doc->nodes.size());
    std::function<void(uint32_t)> traverse = [&](uint32_t node_id) {
        auto it = doc->nodes.find(node_id);
        if (it == doc->nodes.end()) {
            return;
        }
        result.push_back(node_id);
        for (uint32_t child_id : it->second.children) {
            traverse(child_id);
        }
    };
    for (uint32_t root_id : doc->roots) {
        traverse(root_id);
    }
    return result;
}

uint32_t DomManager::FindElementByIdOrName(uint32_t doc_id, const std::string& name) const {
    if (name.empty()) {
        return 0;
    }
    const std::vector<uint32_t> ids = GetAllElementIds(doc_id);
    const DomDocument* doc = FindDocument(doc_id);
    if (!doc) {
        return 0;
    }
    for (uint32_t node_id : ids) {
        auto it = doc->nodes.find(node_id);
        if (it == doc->nodes.end()) {
            continue;
        }
        const auto& attrs = it->second.attrs;
        auto id_it = attrs.find("id");
        if (id_it != attrs.end() && id_it->second == name) {
            return node_id;
        }
        auto name_it = attrs.find("name");
        if (name_it != attrs.end() && name_it->second == name) {
            return node_id;
        }
    }
    return 0;
}

std::string DomManager::GetNodeTagName(uint32_t doc_id, uint32_t node_id) const {
    const DomDocument* doc = FindDocument(doc_id);
    if (!doc) {
        return std::string();
    }
    auto it = doc->nodes.find(node_id);
    if (it == doc->nodes.end()) {
        return std::string();
    }
    return it->second.tag_name;
}

uint32_t DomManager::GetNodeGeneration(uint32_t doc_id, uint32_t node_id) const {
    const DomDocument* doc = FindDocument(doc_id);
    if (!doc) {
        return 0;
    }
    auto it = doc->nodes.find(node_id);
    if (it == doc->nodes.end()) {
        return 0;
    }
    return it->second.generation;
}

bool DomManager::IsValidHandle(const NodeHandle& handle) const {
    return ResolveNode(FindDocument(handle.doc_id), handle) != nullptr;
}

void DomManager::BuildTreeFromSpec(uint32_t* data, uint32_t node_count) {
    if (!data || node_count == 0) {
        return;
    }

    const uint32_t version = data[0];
    const uint32_t result_byte_offset = data[3];

    struct SpecNode {
        int32_t parent = -1;
        float left = 0.0f;
        float top = 0.0f;
        float width = 0.0f;
        float height = 0.0f;
        bool has_left = false;
        bool has_top = false;
    };

    std::vector<SpecNode> nodes(node_count);

    auto apply_style_v1 = [&](SpecNode* node, uint32_t key, uint32_t val) {
        if (!node) {
            return;
        }
        switch (key) {
        case 2:
            node->left = static_cast<float>(static_cast<int32_t>(val));
            node->has_left = true;
            break;
        case 3:
            node->top = static_cast<float>(static_cast<int32_t>(val));
            node->has_top = true;
            break;
        case 4:
            node->width = static_cast<float>(val);
            break;
        case 5:
            node->height = static_cast<float>(val);
            break;
        case 8: {
            const float m = static_cast<float>(static_cast<int32_t>(val));
            node->left += m;
            node->top += m;
            break;
        }
        case 9: {
            const float p = static_cast<float>(val);
            node->width += p * 2.0f;
            node->height += p * 2.0f;
            break;
        }
        default:
            break;
        }
    };

    auto apply_style_v2 = [&](SpecNode* node, uint32_t key_packed, float fval) {
        if (!node) {
            return;
        }

        const uint32_t style_code = key_packed & 0xFFu;
        const uint32_t type_code = (key_packed >> 8u) & 0xFFu;

        switch (style_code) {
        case 2:
            if (type_code != 2) {
                node->left = fval;
                node->has_left = true;
            }
            break;
        case 3:
            if (type_code != 2) {
                node->top = fval;
                node->has_top = true;
            }
            break;
        case 4:
            if (type_code != 2) {
                node->width = std::max(0.0f, fval);
            }
            break;
        case 5:
            if (type_code != 2) {
                node->height = std::max(0.0f, fval);
            }
            break;
        case 8:
            if (type_code != 2) {
                node->left += fval;
                node->top += fval;
            }
            break;
        case 9:
            if (type_code != 2) {
                node->width += std::max(0.0f, fval) * 2.0f;
                node->height += std::max(0.0f, fval) * 2.0f;
            }
            break;
        default:
            break;
        }
    };

    uint32_t pos = 4;
    for (uint32_t i = 0; i < node_count; ++i) {
        if (pos + 4 > static_cast<uint32_t>(std::numeric_limits<uint32_t>::max())) {
            return;
        }

        nodes[i].parent = static_cast<int32_t>(data[pos++]);
        ++pos; // tag_code (unused)
        const uint32_t style_count = data[pos++];
        ++pos; // pad

        for (uint32_t s = 0; s < style_count; ++s) {
            const uint32_t key = data[pos++];
            if (version >= 2) {
                float fval = 0.0f;
                std::memcpy(&fval, &data[pos++], sizeof(float));
                apply_style_v2(&nodes[i], key, fval);
            } else {
                const uint32_t val = data[pos++];
                apply_style_v1(&nodes[i], key, val);
            }
        }
    }

    for (uint32_t i = 0; i < node_count; ++i) {
        const int32_t parent_index = nodes[i].parent;
        if (parent_index < 0 || static_cast<uint32_t>(parent_index) >= node_count) {
            continue;
        }

        const SpecNode& parent = nodes[static_cast<uint32_t>(parent_index)];
        if (!nodes[i].has_left) {
            nodes[i].left += parent.left;
        }
        if (!nodes[i].has_top) {
            nodes[i].top += parent.top;
        }
    }

    float* result = reinterpret_cast<float*>(
        reinterpret_cast<char*>(data) + result_byte_offset);

    for (uint32_t i = 0; i < node_count; ++i) {
        result[i * 4 + 0] = nodes[i].left;
        result[i * 4 + 1] = nodes[i].top;
        result[i * 4 + 2] = std::max(0.0f, nodes[i].width);
        result[i * 4 + 3] = std::max(0.0f, nodes[i].height);
    }
}

}  // namespace dom
}  // namespace leapvm
