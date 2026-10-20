export type Language = "en" | "vi";

export type Theme = "light" | "dark";

export function resolvePreferences(
  saved: { language?: string | null; theme?: string | null },
  browserLanguage: string,
  prefersDark: boolean,
): { language: Language; theme: Theme } {
  return {
    language:
      saved.language === "en" || saved.language === "vi"
        ? saved.language
        : browserLanguage.toLowerCase().startsWith("vi")
          ? "vi"
          : "en",
    theme:
      saved.theme === "light" || saved.theme === "dark"
        ? saved.theme
        : prefersDark
          ? "dark"
          : "light",
  };
}

// English source messages also serve as the English dictionary.
export const vietnamese: Readonly<Record<string, string>> = {
  Language: "Ngôn ngữ",
  "Switch to dark theme": "Chuyển sang giao diện tối",
  "Switch to light theme": "Chuyển sang giao diện sáng",
  "Unable to load workspace": "Không thể tải không gian làm việc",
  "Try again": "Thử lại",
  workspace: "không gian làm việc",
  "Search nodes…": "Tìm nút…",
  errors: "lỗi",
  warnings: "cảnh báo",
  Reload: "Tải lại",
  Graph: "Đồ thị",
  Nodes: "Nút",
  Issues: "Vấn đề",
  Docs: "Tài liệu",
  "LOCAL KB": "CƠ SỞ TRI THỨC CỤC BỘ",
  nodes: "nút",
  "Search knowledge": "Tìm kiếm tri thức",
  "Search titles and aliases…": "Tìm theo tiêu đề và tên khác…",
  "Searching…": "Đang tìm…",
  "No nodes found.": "Không tìm thấy nút.",
  "Type to search your knowledge base.": "Nhập để tìm trong cơ sở tri thức.",
  "Loading graph…": "Đang tải đồ thị…",
  EXPLORER: "KHÁM PHÁ",
  "Knowledge graph": "Đồ thị tri thức",
  relationships: "quan hệ",
  "Node types": "Loại nút",
  Relationships: "Quan hệ",
  Depth: "Độ sâu",
  "Graph depth": "Độ sâu đồ thị",
  "Depth {depth}": "Độ sâu {depth}",
  "Show deprecated": "Hiện nút ngừng sử dụng",
  "Only with issues": "Chỉ hiện nút có vấn đề",
  Orphans: "Nút không có liên kết đến",
  "Every node has an entry point.": "Mọi nút đều có điểm truy cập.",
  "NODE INSPECTOR": "CHI TIẾT NÚT",
  "Explore a connection": "Khám phá một kết nối",
  "Select a node to inspect its relationships and edit its source.":
    "Chọn một nút để xem quan hệ và chỉnh sửa mã nguồn.",
  "Right-click the canvas to create a node.":
    "Nhấp chuột phải vào vùng đồ thị để tạo nút.",
  "Agent plan": "Kế hoạch cho tác tử",
  "Resolving plan…": "Đang lập kế hoạch…",
  "Loading node…": "Đang tải nút…",
  "Add {type}": "Thêm {type}",
  "Find {type}…": "Tìm {type}…",
  "No matching targets.": "Không có nút đích phù hợp.",
  "Remove {target}": "Gỡ {target}",
  "Open editor": "Mở trình chỉnh sửa",
  Plan: "Kế hoạch",
  "No nodes match these filters. Try another depth or type.":
    "Không có nút phù hợp. Hãy thử độ sâu hoặc loại khác.",
  "Connect nodes": "Kết nối các nút",
  "No valid relationship kinds for these node types.":
    "Không có quan hệ hợp lệ cho các loại nút này.",
  "New {type} here…": "Tạo {type} tại đây…",
  "New {type}": "Tạo {type}",
  "Path within {folder}": "Đường dẫn trong {folder}",
  Title: "Tiêu đề",
  Summary: "Tóm tắt",
  "Create node": "Tạo nút",
  "Loading nodes…": "Đang tải các nút…",
  LIBRARY: "THƯ VIỆN",
  "Add goal": "Thêm mục tiêu",
  "Add other node types": "Thêm loại nút khác",
  "Filter nodes": "Lọc nút",
  "Filter by title or ID…": "Lọc theo tiêu đề hoặc ID…",
  "Node type": "Loại nút",
  "All types": "Tất cả loại",
  "Node status": "Trạng thái nút",
  "All statuses": "Tất cả trạng thái",
  Active: "Đang sử dụng",
  Deprecated: "Ngừng sử dụng",
  Tag: "Thẻ",
  "All tags": "Tất cả thẻ",
  "No nodes match these filters.": "Không có nút phù hợp với bộ lọc.",
  "{first}–{last} of {total}": "{first}–{last} trên {total}",
  "Rows per page": "Số dòng mỗi trang",
  "Page {page} of {total}": "Trang {page} trên {total}",
  "First page": "Trang đầu",
  "Previous page": "Trang trước",
  "Next page": "Trang sau",
  "Last page": "Trang cuối",
  Type: "Loại",
  Status: "Trạng thái",
  Tags: "Thẻ",
  In: "Liên kết đến",
  Out: "Liên kết đi",
  "Discard unsaved changes?": "Bỏ các thay đổi chưa lưu?",
  "← All nodes": "← Tất cả nút",
  "View in graph": "Xem trên đồ thị",
  Frontmatter: "Siêu dữ liệu",
  Outgoing: "Liên kết đi",
  Incoming: "Liên kết đến",
  None: "Không có",
  "Saved.": "Đã lưu.",
  "Saved to disk": "Đã lưu vào đĩa",
  "Markdown source": "Mã nguồn Markdown",
  "Unsaved changes": "Thay đổi chưa lưu",
  "Saving…": "Đang lưu…",
  "Save file": "Lưu tệp",
  "Delete file": "Xóa tệp",
  "Published documentation": "Tài liệu xuất bản",
  "Open docs": "Mở tài liệu",
  "Graph docs": "Tài liệu đồ thị",
  "Loading documentation…": "Đang tải tài liệu…",
  "This node contributes to the following live page.":
    "Nút này đóng góp nội dung cho trang xem trước sau.",
  "Open {path}": "Mở {path}",
  "This node has no docs.path. Add a docs path in Source to include it in the site preview.":
    "Nút này chưa có docs.path. Thêm đường dẫn tài liệu trong phần mã nguồn để hiện trong bản xem trước.",
  "Browse graph documentation →": "Xem tài liệu đồ thị →",
  "Delete this file?": "Xóa tệp này?",
  "{path} will be permanently deleted.": "{path} sẽ bị xóa vĩnh viễn.",
  "{count} nodes reference this node. Their relationships will become dangling.":
    "{count} nút tham chiếu đến nút này. Các quan hệ đó sẽ mất đích liên kết.",
  VALIDATION: "KIỂM TRA",
  Severity: "Mức độ",
  "All severities": "Tất cả mức độ",
  Errors: "Lỗi",
  Warnings: "Cảnh báo",
  "All clear": "Không có vấn đề",
  "No issues match this view.": "Không có vấn đề phù hợp với chế độ xem này.",
  issues: "vấn đề",
  "Source ↗": "Mã nguồn ↗",
  "Fix this file on disk, then Reload": "Sửa tệp trên đĩa, sau đó tải lại",
  Overview: "Tổng quan",
  Documentation: "Tài liệu",
  "Docs layout": "Bố cục tài liệu",
  "{count} lint errors · Preview is available, but simp-docs would refuse to export.":
    "{count} lỗi kiểm tra · Có thể xem trước, nhưng simp-docs sẽ từ chối xuất.",
  Breadcrumb: "Đường dẫn điều hướng",
  "Rendering page…": "Đang hiển thị trang…",
  "No documentation pages": "Chưa có trang tài liệu",
  "Add docs.path to nodes or select the graph layout.":
    "Thêm docs.path vào nút hoặc chọn bố cục đồ thị.",
  Previous: "Trước",
  Next: "Sau",
  "On this page": "Trên trang này",
  Close: "Đóng",
  Goal: "Mục tiêu",
  Procedure: "Quy trình",
  Capability: "Khả năng",
  State: "Trạng thái",
  Constraint: "Ràng buộc",
  Procedures: "Quy trình",
  Requires: "Yêu cầu",
  Preconditions: "Điều kiện tiên quyết",
  "Optional preconditions": "Điều kiện tiên quyết tùy chọn",
  Produces: "Tạo ra",
  Uses: "Sử dụng",
  "Constrained by": "Chịu ràng buộc bởi",
  "Satisfied by": "Được đáp ứng bởi",
  Related: "Liên quan",
  "Choice option": "Phương án lựa chọn",
  Blocking: "Chặn",
  Warning: "Cảnh báo",
  Error: "Lỗi",
  Missing: "Không tồn tại",
  All: "Tất cả",
  Source: "Mã nguồn",
  Site: "Trang web",
  Node: "Nút",
  Aliases: "Tên khác",
  Availability: "Điều kiện khả dụng",
  Permissions: "Quyền",
  Plans: "Gói",
  "When to use": "Khi nào sử dụng",
  Check: "Kiểm tra",
  Choices: "Lựa chọn",
  Sources: "Nguồn tham khảo",
  "Zoom in": "Phóng to",
  "Zoom out": "Thu nhỏ",
  "Fit view": "Vừa khung nhìn",
  "Toggle interactivity": "Bật/tắt tương tác",
  "Knowledge graph canvas": "Vùng đồ thị tri thức",
  "Mini map": "Bản đồ thu nhỏ",
  "Graph controls": "Điều khiển đồ thị",
  "Connection handle": "Điểm kết nối",
  "Select a node with Enter or Space; move it with the arrow keys. Press Escape to cancel.":
    "Chọn nút bằng Enter hoặc phím cách; di chuyển bằng phím mũi tên. Nhấn Escape để hủy.",
  "Select a node with Enter or Space. Press Escape to cancel.":
    "Chọn nút bằng Enter hoặc phím cách. Nhấn Escape để hủy.",
  "Select a relationship with Enter or Space. Press Escape to cancel.":
    "Chọn quan hệ bằng Enter hoặc phím cách. Nhấn Escape để hủy.",
  "Moved node {direction}. Position: {x}, {y}.":
    "Đã di chuyển nút {direction}. Vị trí: {x}, {y}.",
  left: "sang trái",
  right: "sang phải",
  up: "lên trên",
  down: "xuống dưới",
  "Source editor": "Trình chỉnh sửa mã nguồn",
  "An outcome you want to achieve.": "Kết quả bạn muốn đạt được.",
  "Steps to follow to complete a task.":
    "Các bước thực hiện để hoàn thành một tác vụ.",
  "A feature or ability available in the system.":
    "Tính năng hoặc khả năng có sẵn trong hệ thống.",
  "A condition that can be checked or established.":
    "Điều kiện có thể kiểm tra hoặc thiết lập.",
  "A rule or restriction that must be considered.":
    "Quy tắc hoặc giới hạn cần xem xét.",
  "Procedures that help achieve this goal.":
    "Các quy trình giúp đạt mục tiêu này.",
  "Dependencies needed by this procedure or capability.":
    "Các phụ thuộc cần có cho quy trình hoặc khả năng này.",
  "States that must hold before this procedure runs.":
    "Các trạng thái phải được đáp ứng trước khi thực hiện quy trình.",
  "States that may help but are not required.":
    "Các trạng thái hữu ích nhưng không bắt buộc.",
  "States established by this procedure.":
    "Các trạng thái được thiết lập bởi quy trình này.",
  "Capabilities used by this procedure.":
    "Các khả năng được quy trình này sử dụng.",
  "Rules or restrictions that apply to this node.":
    "Các quy tắc hoặc giới hạn áp dụng cho nút này.",
  "Procedures that can establish this state.":
    "Các quy trình có thể thiết lập trạng thái này.",
  "Related nodes, including links in the document body.":
    "Các nút liên quan, gồm liên kết trong nội dung tài liệu.",
  "A procedure offered as an alternative in a choice.":
    "Quy trình được đưa ra như một phương án trong lựa chọn.",
  "Currently maintained and intended for use.":
    "Đang được duy trì và dành để sử dụng.",
  "No longer recommended for new use.":
    "Không còn được khuyến nghị cho nhu cầu mới.",
  "A constraint that must be satisfied to proceed.":
    "Ràng buộc phải được đáp ứng để tiếp tục.",
  "A constraint to consider before proceeding.":
    "Ràng buộc cần xem xét trước khi tiếp tục.",
  "A validation problem that must be fixed.":
    "Vấn đề kiểm tra cần được khắc phục.",
  "A potential problem that should be reviewed.":
    "Vấn đề tiềm ẩn cần được xem xét.",
};

export function translate(
  language: Language,
  message: string,
  values: Record<string, string | number> = {},
): string {
  const text =
    language === "vi" && Object.hasOwn(vietnamese, message)
      ? vietnamese[message]
      : message;
  return text.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    String(values[key] ?? placeholder),
  );
}
