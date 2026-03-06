#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace leapvm {
namespace dom {

struct NodeHandle {
    uint32_t doc_id = 0;
    uint32_t node_id = 0;
    uint32_t generation = 0;
};

struct LayoutRect {
    double x = 0;
    double y = 0;
    double width = 0;
    double height = 0;
};

struct TraceSnapshotNode {
    int32_t node_type = 0;
    std::string node_name;
    std::string tag_name;
    std::string id;
    std::string class_name;
    std::string text_content;
    std::string path;
    LayoutRect rect;
    std::unordered_map<std::string, std::string> attrs;
    std::vector<TraceSnapshotNode> children;
};

class DomManager {
public:
    size_t document_count() const { return documents_.size(); }
    size_t task_scope_count() const { return task_scope_docs_.size(); }
    size_t handle_count() const { return handle_table_.size(); }

    uint32_t CreateDocument(const std::string& task_id);
    bool ReleaseDocument(uint32_t doc_id);
    size_t ReleaseTaskScope(const std::string& task_id);

    bool CreateElement(uint32_t doc_id, const std::string& tag_name, NodeHandle* out_handle);
    bool AppendChild(uint32_t doc_id,
                     const std::optional<NodeHandle>& parent_handle,
                     const NodeHandle& child_handle);
    bool RemoveChild(uint32_t doc_id,
                     const std::optional<NodeHandle>& parent_handle,
                     const NodeHandle& child_handle);
    bool SetStyle(uint32_t doc_id,
                  const NodeHandle& handle,
                  const std::string& name,
                  const std::string& value);
    bool SetStyleNormalized(uint32_t doc_id,
                            const NodeHandle& handle,
                            const std::string& normalized_name,
                            const std::string& normalized_value);
    bool SetStylePacked(uint32_t doc_id,
                        const NodeHandle& handle,
                        uint32_t style_code,
                        int32_t packed_value);
    bool GetLayoutRect(uint32_t doc_id, const NodeHandle& handle, LayoutRect* out_rect);
    bool ParseHTMLIntoDocument(uint32_t doc_id, const std::string& html_text);
    bool SnapshotDocument(uint32_t doc_id, TraceSnapshotNode* out_snapshot);
    std::vector<uint32_t> GetAllElementIds(uint32_t doc_id) const;
    uint32_t FindElementByIdOrName(uint32_t doc_id, const std::string& name) const;
    std::string GetNodeTagName(uint32_t doc_id, uint32_t node_id) const;
    uint32_t GetNodeGeneration(uint32_t doc_id, uint32_t node_id) const;

    bool IsValidHandle(const NodeHandle& handle) const;

    // Binary Tree Spec API (V1/V2) - single bridge call for full tree layout.
    void BuildTreeFromSpec(uint32_t* data, uint32_t node_count);

private:
    struct DomNode {
        uint32_t id = 0;
        uint32_t generation = 1;
        uint32_t parent_id = 0;
        std::string tag_name;
        std::unordered_map<std::string, std::string> attrs;
        std::unordered_map<std::string, std::string> style_map;
        std::vector<uint32_t> children;
        bool layout_dirty = true;
    };

    struct DomDocument {
        uint32_t id = 0;
        std::string task_id;
        uint32_t next_node_id = 1;
        std::unordered_map<uint32_t, DomNode> nodes;
        std::vector<uint32_t> roots;
    };

    static uint64_t MakeHandleKey(uint32_t doc_id, uint32_t node_id);
    static std::string NormalizeCssName(const std::string& input);
    static double ParsePixels(const std::string& input);

    DomDocument* FindDocument(uint32_t doc_id);
    const DomDocument* FindDocument(uint32_t doc_id) const;
    DomNode* ResolveNode(DomDocument* doc, const NodeHandle& handle);
    const DomNode* ResolveNode(const DomDocument* doc, const NodeHandle& handle) const;
    std::optional<uint32_t> ResolveParentId(
        DomDocument* doc,
        const std::optional<NodeHandle>& parent_handle) const;

    bool IsAncestor(const DomDocument* doc, uint32_t ancestor_id, uint32_t target_id) const;
    void DetachFromParent(DomDocument* doc, DomNode* node);
    void ReleaseNodeSubtree(DomDocument* doc, uint32_t node_id);

    LayoutRect ComputeLayoutRect(const DomNode& node) const;
    bool BuildSnapshotNode(const DomDocument* doc,
                           uint32_t node_id,
                           const std::string& parent_path,
                           TraceSnapshotNode* out_snapshot) const;

    uint32_t next_doc_id_ = 1;
    std::unordered_map<uint32_t, DomDocument> documents_;
    std::unordered_map<std::string, std::unordered_set<uint32_t>> task_scope_docs_;
    std::unordered_map<uint64_t, uint32_t> handle_table_;
};

}  // namespace dom
}  // namespace leapvm
