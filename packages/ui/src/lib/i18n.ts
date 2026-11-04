export type Language = "en" | "vi";

export type Theme = "light" | "dark";

export function resolvePreferences(
  saved: { language?: string | null; theme?: string | null },
  browserLanguage: string,
): { language: Language; theme: Theme } {
  return {
    language:
      saved.language === "en" || saved.language === "vi"
        ? saved.language
        : browserLanguage.toLowerCase().startsWith("vi")
          ? "vi"
          : "en",
    theme:
      saved.theme === "light" || saved.theme === "dark" ? saved.theme : "light",
  };
}

// English source messages also serve as the English dictionary.
export const vietnamese: Readonly<Record<string, string>> = {
  "Search titles or IDs…": "Tìm theo tiêu đề hoặc ID…",
  "This knowledge base has validation errors. Results may be incomplete.":
    "Cơ sở tri thức có lỗi kiểm tra. Kết quả có thể chưa đầy đủ.",
  Playground: "Thử nghiệm",
  "KNOWLEDGE TOOLS": "CÔNG CỤ TRI THỨC",
  "Run an action to see results here.":
    "Chạy một thao tác để xem kết quả tại đây.",
  "Find answers": "Tìm câu trả lời",
  "Plan a goal": "Lập kế hoạch cho mục tiêu",
  "Plan a procedure": "Lập kế hoạch cho quy trình",
  "View details": "Xem chi tiết",
  "Explore connections": "Khám phá liên kết",
  "Explore your knowledge base and try a plan.":
    "Khám phá cơ sở tri thức và thử lập kế hoạch.",
  "Plans provide guidance. They do not perform actions or change your files.":
    "Kế hoạch chỉ hướng dẫn, không thực hiện thao tác hoặc thay đổi tệp.",
  Actions: "Thao tác",
  "Describe what you want to do and find a starting point.":
    "Mô tả điều bạn muốn làm để tìm điểm bắt đầu.",
  "Turn a goal into a step-by-step plan.":
    "Chuyển mục tiêu thành kế hoạch từng bước.",
  "Get guidance for a specific procedure.":
    "Nhận hướng dẫn cho một quy trình cụ thể.",
  "Read an item and its relationships.":
    "Đọc nội dung và các quan hệ của một mục.",
  "See what an item needs and what depends on it.":
    "Xem một mục cần gì và những gì phụ thuộc vào mục đó.",
  "Choose an item…": "Chọn một mục…",
  "What would you like to do?": "Bạn muốn làm gì?",
  "Describe your goal…": "Mô tả mục tiêu của bạn…",
  "Content type": "Loại nội dung",
  Item: "Mục",
  "Tailor your plan": "Điều chỉnh kế hoạch",
  "Leave anything you do not know unanswered. The plan will tell you what to check.":
    "Bỏ qua những điều chưa biết. Kế hoạch sẽ cho biết cần kiểm tra gì.",
  "Choose a goal to see the conditions and decisions its plan depends on.":
    "Chọn một mục tiêu để xem các điều kiện và lựa chọn mà kế hoạch phụ thuộc vào.",
  "Choose a procedure to see the conditions and decisions its plan depends on.":
    "Chọn một quy trình để xem các điều kiện và lựa chọn mà kế hoạch phụ thuộc vào.",
  "This plan has no conditions or decisions to answer.":
    "Kế hoạch này không có điều kiện hay lựa chọn nào cần trả lời.",
  "Not sure": "Chưa rõ",
  "Decide later": "Quyết định sau",
  "Account plan (optional)": "Gói tài khoản (không bắt buộc)",
  "Permissions (optional, separated by commas)":
    "Quyền (không bắt buộc, cách nhau bằng dấu phẩy)",
  "Show connections": "Hiển thị liên kết",
  "All connections": "Tất cả liên kết",
  "What this needs": "Mục này cần gì",
  "What depends on this": "Những gì phụ thuộc vào mục này",
  "How far to explore": "Số cấp cần khám phá",
  "Working…": "Đang xử lý…",
  Results: "Kết quả",
  "No matches. Try different words or filters.":
    "Không có kết quả. Hãy thử từ khóa hoặc bộ lọc khác.",
  "Your plan": "Kế hoạch của bạn",
  "Suggested goals": "Mục tiêu gợi ý",
  "Matching items": "Các mục phù hợp",
  "Connected items": "Các mục liên kết",
  "Some connections were omitted. Explore a connected item to see more.":
    "Một số liên kết đã được lược bớt. Khám phá mục liên kết để xem thêm.",
  "Open the item to read its full content.": "Mở mục để đọc toàn bộ nội dung.",
  "Open the item for more details.": "Mở mục để xem thêm chi tiết.",
  "Make a plan": "Lập kế hoạch",
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
  "Knowledge base actions": "Thao tác cơ sở tri thức",
  "Open another knowledge base": "Mở cơ sở tri thức khác",
  "Close knowledge base": "Đóng cơ sở tri thức",
  Preferences: "Tùy chọn",
  Theme: "Giao diện",
  Light: "Sáng",
  Dark: "Tối",
  "Open a knowledge base": "Mở cơ sở tri thức",
  "Open a local folder of Markdown nodes to explore and edit, or connect to a simp node to browse it read-only.":
    "Mở một thư mục cục bộ chứa các nút Markdown để khám phá và chỉnh sửa, hoặc kết nối tới một simp node để xem ở chế độ chỉ đọc.",
  "Folder access requires HTTPS or localhost.":
    "Truy cập thư mục yêu cầu HTTPS hoặc localhost.",
  "Open KB folder": "Mở thư mục cơ sở tri thức",
  Recent: "Gần đây",
  Reopen: "Mở lại",
  "Reopen {name}": "Mở lại {name}",
  "Or connect to a simp node": "Hoặc kết nối tới một nút simp",
  "Simp node URL": "URL của nút simp",
  "Token (optional)": "Mã truy cập (không bắt buộc)",
  Connect: "Kết nối",
  "Simp nodes open read-only. Add this page's origin to the node's allowed origins.":
    "Nút simp được mở ở chế độ chỉ đọc. Hãy thêm origin của trang này vào danh sách origin được phép của nút.",
  "Chromium browsers save directly to your folder. Other browsers keep changes in memory; download a zip to keep them.":
    "Trình duyệt Chromium lưu trực tiếp vào thư mục. Trình duyệt khác giữ thay đổi trong bộ nhớ; hãy tải tệp zip để lưu lại.",
  "Dot-files and dot-folders such as .git are excluded. Git URLs are not supported.":
    "Các tệp và thư mục bắt đầu bằng dấu chấm như .git sẽ bị bỏ qua. Không hỗ trợ URL Git.",
  Graph: "Đồ thị",
  Nodes: "Nút",
  Issues: "Vấn đề",
  Docs: "Tài liệu",
  FOLDER: "THƯ MỤC",
  MEMORY: "BỘ NHỚ",
  REMOTE: "TỪ XA",
  "Read-only": "Chỉ đọc",
  "Folder: changes save straight to disk.":
    "Thư mục: thay đổi được lưu thẳng vào đĩa.",
  "In memory: download the KB to keep changes.":
    "Trong bộ nhớ: tải KB xuống để giữ thay đổi.",
  "Remote simp node: read-only.": "Simp node từ xa: chỉ đọc.",
  "View source": "Xem mã nguồn",
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
  "Show all {count}": "Hiện tất cả {count}",
  "Show fewer": "Thu gọn",
  Filters: "Bộ lọc",
  "NODE INSPECTOR": "CHI TIẾT NÚT",
  "Explore a connection": "Khám phá một kết nối",
  "Select a node to inspect its relationships and edit its source.":
    "Chọn một nút để xem quan hệ và chỉnh sửa mã nguồn.",
  "Right-click the canvas to create a node.":
    "Nhấp chuột phải vào vùng đồ thị để tạo nút.",
  "Agent plan": "Kế hoạch cho tác tử",
  "Resolving plan…": "Đang lập kế hoạch…",
  "No documentation for this node.": "Nút này chưa có tài liệu.",
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
  "1 error": "1 lỗi",
  "{count} errors": "{count} lỗi",
  "1 warning": "1 cảnh báo",
  "{count} warnings": "{count} cảnh báo",
  "in 1 file": "trong 1 tệp",
  "in {count} files": "trong {count} tệp",
  "in this file": "trong tệp này",
  "Line {line}": "Dòng {line}",
  "Fix in source": "Sửa trong mã nguồn",
  "This file can't be opened here. Fix it in your editor, then Reload.":
    "Không thể mở tệp này tại đây. Hãy sửa trong trình soạn thảo của bạn, rồi tải lại.",
  "This file can't be opened here. Download the KB to keep your edits, fix the file in your editor, then open the folder again.":
    "Không thể mở tệp này tại đây. Hãy tải KB xuống để giữ các chỉnh sửa, sửa tệp trong trình soạn thảo của bạn, rồi mở lại thư mục.",
  "Fix this file in the simp node's own folder.":
    "Hãy sửa tệp này trong thư mục của chính simp node.",
  "What these codes mean": "Ý nghĩa của các mã",
  "Two files have the same ID; only the first is loaded.":
    "Hai tệp có cùng ID; chỉ tệp đầu tiên được nạp.",
  "The id field does not match the file path. Remove it.":
    "Trường id không khớp với đường dẫn tệp. Hãy xóa nó.",
  "The file is outside a type folder, or its type does not match the folder.":
    "Tệp nằm ngoài thư mục loại, hoặc loại của nó không khớp với thư mục.",
  "The file path cannot form an ID. Use lowercase kebab-case names.":
    "Đường dẫn tệp không tạo được ID. Hãy dùng tên kebab-case viết thường.",
  "The frontmatter has a key this node type does not allow.":
    "Frontmatter có khóa mà loại nút này không cho phép.",
  "A required field or list item is missing.":
    "Thiếu một trường hoặc mục danh sách bắt buộc.",
  "A reference points to a node that does not exist.":
    "Một tham chiếu trỏ tới nút không tồn tại.",
  "A reference has the wrong node type for this field.":
    "Một tham chiếu có loại nút không đúng cho trường này.",
  "Requirements or choice options form a cycle.":
    "Các yêu cầu hoặc lựa chọn tạo thành vòng lặp.",
  "A procedure needs a ## Steps section with a numbered list.":
    "Quy trình cần mục ## Steps có danh sách đánh số.",
  "Goals cannot contain steps; move them to a procedure.":
    "Mục tiêu không được chứa các bước; hãy chuyển chúng sang một quy trình.",
  "A value has the wrong type or is not one of the allowed values.":
    "Một giá trị sai kiểu hoặc không thuộc các giá trị cho phép.",
  "The frontmatter is missing or is not valid YAML.":
    "Thiếu frontmatter hoặc frontmatter không phải YAML hợp lệ.",
  "Each choice must appear exactly once in ## Steps as choice:<id>.":
    "Mỗi lựa chọn phải xuất hiện đúng một lần trong ## Steps dưới dạng choice:<id>.",
  "Choice IDs or option keys are repeated.":
    "ID lựa chọn hoặc khóa phương án bị lặp lại.",
  "A qualified reference names a simp that is not declared as a peer.":
    "Một tham chiếu đầy đủ nhắc tới simp chưa được khai báo là peer.",
  "Nothing links to this node.": "Không có gì liên kết tới nút này.",
  "This goal has no aliases, so it is harder to find.":
    "Mục tiêu này không có bí danh nên khó tìm hơn.",
  "The summary is longer than 200 characters.":
    "Phần tóm tắt dài hơn 200 ký tự.",
  "An active node references a deprecated one.":
    "Một nút đang hoạt động tham chiếu tới nút đã ngừng dùng.",
  "Another goal uses the same alias.": "Một mục tiêu khác dùng cùng bí danh.",
  "No procedure produces this state.":
    "Không có quy trình nào tạo ra trạng thái này.",
  "This procedure is available more widely than a capability it uses.":
    "Quy trình này khả dụng rộng hơn một năng lực mà nó sử dụng.",
  "This choice has only one option.": "Lựa chọn này chỉ có một phương án.",
  "A peer was unreachable, so remote references were not checked.":
    "Không kết nối được một peer nên chưa kiểm tra các tham chiếu từ xa.",
  "Saved in memory": "Đã lưu trong bộ nhớ",
  "Next issue ({position} of {total})": "Vấn đề tiếp theo ({position}/{total})",
  "Cleared 1 issue:": "Đã xử lý 1 vấn đề:",
  "Cleared {count} issues:": "Đã xử lý {count} vấn đề:",
  "Saved. No issues cleared yet.": "Đã lưu. Chưa xử lý được vấn đề nào.",
  "Saved, but the frontmatter no longer parses, so its other issues can't be checked.":
    "Đã lưu, nhưng frontmatter không còn đọc được nên chưa thể kiểm tra các vấn đề khác.",
  "Start fixing": "Bắt đầu sửa",
  "No issues left in this file.": "Tệp này không còn vấn đề nào.",
  "View remaining issues": "Xem các vấn đề còn lại",
  "Every file is clean.": "Mọi tệp đều không có vấn đề.",
  Overview: "Tổng quan",
  Documentation: "Tài liệu",
  "Docs layout": "Bố cục tài liệu",
  "Download docs (.zip)": "Tải tài liệu (.zip)",
  "{count} lint errors · Preview is available, but simp-docs would refuse to export.":
    "{count} lỗi kiểm tra · Có thể xem trước, nhưng simp-docs sẽ từ chối xuất.",
  Breadcrumb: "Đường dẫn điều hướng",
  "Rendering page…": "Đang hiển thị trang…",
  "No documentation pages": "Chưa có trang tài liệu",
  "Add nodes, or fix the files listed in Issues.":
    "Thêm nút hoặc sửa các tệp được liệt kê trong mục Vấn đề.",
  Previous: "Trước",
  Next: "Sau",
  "On this page": "Trên trang này",
  Close: "Đóng",
  Goal: "Mục tiêu",
  Procedure: "Quy trình",
  Capability: "Khả năng",
  State: "Trạng thái",
  Constraint: "Ràng buộc",
  Simp: "Cơ sở tri thức sản phẩm",
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
  "Expand diagram": "Mở rộng sơ đồ",
  "Collapse diagram": "Thu gọn sơ đồ",
  "Search nodes in view": "Tìm nút đang hiển thị",
  "No matching nodes in view.": "Không có nút phù hợp trong khung nhìn.",
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
  "A product manifest and knowledge-base homepage.":
    "Thông tin sản phẩm và trang chủ cơ sở tri thức.",
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
  Skills: "Kỹ năng",
  "AGENT SKILLS": "KỸ NĂNG CHO AGENT",
  "Skills teach a coding agent how to write and use a Simplink knowledge base.":
    "Kỹ năng hướng dẫn coding agent cách viết và sử dụng cơ sở tri thức Simplink.",
  "Uses the Simplink packages from the command line or from code: lint, search, and resolve a KB, export docs, serve it over MCP, run a simp node, or embed KB tools in an app.":
    "Dùng các gói Simplink qua dòng lệnh hoặc trong mã: kiểm tra, tìm kiếm và lập kế hoạch từ KB, xuất tài liệu, phục vụ qua MCP, chạy simp node hoặc nhúng công cụ KB vào ứng dụng.",
  "Download skills (.zip)": "Tải kỹ năng (.zip)",
  "Builds or re-syncs a knowledge base from a product's source code and docs. Use it when the agent can read the codebase.":
    "Xây dựng hoặc đồng bộ lại cơ sở tri thức từ mã nguồn và tài liệu của sản phẩm. Dùng khi agent đọc được mã nguồn.",
  "Builds or re-syncs a knowledge base from a documentation site, help center, or folder of doc pages, when no source code is available. Reuses product-kb-builder's references and scripts, so install both.":
    "Xây dựng hoặc đồng bộ lại cơ sở tri thức từ trang tài liệu, trung tâm trợ giúp hoặc thư mục tài liệu khi không có mã nguồn. Dùng lại tài liệu tham khảo và script của product-kb-builder, nên hãy cài cả hai.",
  "Try asking:": "Thử yêu cầu:",
  "Set up in your coding agent": "Cài đặt vào coding agent",
  "Install the Simplink CLI in the project; the skills run simp-lint, simp-search, and simp-resolve.":
    "Cài Simplink CLI vào dự án; kỹ năng sẽ chạy simp-lint, simp-search và simp-resolve.",
  "Unzip the bundle into your agent's skills folder. Keep the folders side by side.":
    "Giải nén gói vào thư mục kỹ năng của agent. Giữ các thư mục nằm cạnh nhau.",
  "Other agents: use the agent's skills folder if it supports Agent Skills, or tell it to read the SKILL.md file before starting.":
    "Agent khác: dùng thư mục kỹ năng của agent nếu hỗ trợ Agent Skills, hoặc yêu cầu agent đọc tệp SKILL.md trước khi bắt đầu.",
  "Restart the agent, then ask for a knowledge base in plain words. The agent loads the matching skill.":
    "Khởi động lại agent, rồi yêu cầu tạo cơ sở tri thức bằng lời thường. Agent sẽ tự nạp kỹ năng phù hợp.",
  "Open the resulting kb folder here to review the graph and fix issues.":
    "Mở thư mục kb vừa tạo tại đây để xem đồ thị và sửa lỗi.",
  // Nested frontmatter fields
  Path: "Đường dẫn",
  Order: "Thứ tự",
  Question: "Câu hỏi",
  Options: "Tùy chọn",
  Key: "Khóa",
  When: "Khi nào",
  Name: "Tên",
  "Docs url": "URL tài liệu",
  Serves: "Phục vụ",
  Peers: "Các peer",
  Url: "URL",
  Mode: "Chế độ",
  // Confirmations
  Cancel: "Hủy",
  Dismiss: "Ẩn",
  "Download .zip and leave": "Tải .zip rồi rời đi",
  "Preparing .zip…": "Đang chuẩn bị .zip…",
  "Leave without downloading?": "Rời đi mà không tải xuống?",
  "Leave without downloading": "Rời đi, không tải xuống",
  "Changes were saved in memory while the folder was opening. Download them as a .zip to keep them.":
    "Các thay đổi đã được lưu trong bộ nhớ khi thư mục đang mở. Tải xuống dạng .zip để giữ lại.",
  "Your changes live only in this browser tab. Download the KB as a .zip to keep them.":
    "Thay đổi của bạn chỉ nằm trong thẻ trình duyệt này. Tải KB xuống dạng .zip để giữ lại.",
  "The editor has changes that aren't saved.":
    "Trình soạn thảo có thay đổi chưa được lưu.",
  "The editor has changes that aren't saved. Saved memory edits are kept only if you download them.":
    "Trình soạn thảo có thay đổi chưa được lưu. Các chỉnh sửa đã lưu trong bộ nhớ chỉ được giữ nếu bạn tải xuống.",
  "Discard and leave": "Bỏ thay đổi và rời đi",
  "Reload this workspace?": "Tải lại không gian làm việc?",
  "Reload rereads this memory workspace and keeps your edits.":
    "Tải lại sẽ đọc lại không gian làm việc trong bộ nhớ và giữ nguyên các chỉnh sửa.",
  "1 node references this node. That relationship will become dangling.":
    "1 nút tham chiếu đến nút này. Quan hệ đó sẽ mất đích liên kết.",
  // Workspace status
  "Opening folder…": "Đang mở thư mục…",
  "Folder selection cancelled.": "Đã hủy chọn thư mục.",
  "Open this page over HTTPS or localhost to access folders.":
    "Mở trang này qua HTTPS hoặc localhost để truy cập thư mục.",
  "Folder permission denied. Open the folder again to grant access.":
    "Quyền truy cập thư mục bị từ chối. Mở lại thư mục để cấp quyền.",
  "Changes saved in memory. Download to keep them. Dot-files and dot-folders are excluded.":
    "Thay đổi được lưu trong bộ nhớ. Tải xuống để giữ lại. Tệp và thư mục bắt đầu bằng dấu chấm bị bỏ qua.",
  "Download KB (.zip)": "Tải KB (.zip)",
  "The last rebuild failed. Reload to refresh this workspace.":
    "Lần dựng lại gần nhất thất bại. Tải lại để làm mới không gian làm việc.",
  "Drag to resize": "Kéo để đổi kích thước",
  // Errors raised by the workspace
  "Node not found": "Không tìm thấy nút",
  "File not found": "Không tìm thấy tệp",
  "File already exists": "Tệp đã tồn tại",
  "Workspace closed": "Không gian làm việc đã đóng",
  "Workspace storage unavailable":
    "Không dùng được bộ nhớ lưu không gian làm việc",
  "Only goals and procedures have plans":
    "Chỉ mục tiêu và quy trình mới có kế hoạch",
  "Missing frontmatter": "Thiếu siêu dữ liệu",
  "Invalid frontmatter": "Siêu dữ liệu không hợp lệ",
  "Invalid relationship kind or targets": "Loại quan hệ hoặc đích không hợp lệ",
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
