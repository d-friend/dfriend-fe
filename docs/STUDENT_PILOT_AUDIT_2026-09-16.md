# Audit student và bài tập — phạm vi pilot D-Friend

Ngày: 16/09/2026. Trạng thái: audit hoàn tất; nhóm must-have ưu tiên 1–2 đã được implement local, chưa deploy/live E2E.

## 1. Kết luận

**Giữ sản phẩm student nhỏ: nhận bài → xem content → làm một arc → chat/nộp đáp án/nộp giải thích → nhận kết quả trung thực → giáo viên dùng report → follow-up nếu cần.**

Không cần triển khai toàn bộ Canonical Greenfield Design trước cuối tuần. Nhưng không thể lấy việc có chat, nút nộp và điểm số làm bằng chứng learning model đã được thực hiện đúng. Những chỗ cần sửa trước tiên nằm ở định danh bài đang chấm, ý định nộp reasoning, phục hồi trên điện thoại và cách dữ liệu gốc trở thành nhận định trong report.

Ba kết luận quan trọng nhất từ code:

1. **Chỉ số reasoning/transfer hiện tại không đủ làm thước đo pilot.** Đã tái hiện local: một bài P4 có đáp án được chấp nhận, approach `NOT_ASSESSED`, không có reasoning evidence, vẫn được tổng hợp thành reasoning 1.0, transfer 1.0 và quality `sound`.
2. **Hành động “Nộp giải thích” riêng chưa có.** Khi đang giữ đáp án, chat có thể được Ground chấm để đóng bài. Nháp viết bên cạnh đề lại không được gửi làm evidence.
3. **Phần đo quyết định giáo viên đã có đáng kể.** Before/open/after, mức áp dụng, insight dùng cho lớp đối chứng, report snapshot và export đã có code; tận dụng và kiểm chứng, không xây một dashboard mới.

### Cập nhật implementation cùng ngày

Đã sửa các đường làm sai evidence trước pilot:

- Request có `problem_id`, `command` và command ID bền qua retry; Nest chặn bài cũ trước khi gọi AI, AI kiểm lại với `current_problem_id`.
- Tách `CHAT`, `SUBMIT_ANSWER`, `SUBMIT_REASONING`, `SKIP_PROBLEM`. Chat thường không thể tự đóng reasoning hold. Học sinh có thể nộp trực tiếp phần nháp làm giải thích.
- `SKIPPED` là outcome riêng, không cộng mastery/progress và không được ghi là solved/mastered.
- Reasoning chưa được xác nhận và transfer phụ thuộc reasoning được giữ là `null`; report/feedback không đổi thiếu dữ liệu thành 0 điểm hoặc gap.
- Draft, transcript và pending turn được giữ qua reload trong session browser; retry dùng lại cùng command ID. Hình đề `attachment_url` được render và mở lớn trên mobile.
- Rate threshold chỉ còn là telemetry; nó không được tự đổi một bài Ground đánh giá có nghĩa thành farming. `NOT_REQUIRED` không tự mở reasoning gate. Intermediate reasoning probe được tính vào cap 3.
- Raw user/assistant message lưu thêm `problem_id`, `command`, `correlation_id` để truy evidence.
- S02 đã có phím toán nhanh và preview dùng chung cho đáp án, nháp và composer reasoning/chat; nội dung gửi vẫn là chuỗi học sinh đã nhập, preview không âm thầm sửa submission.
- Durable `mastery_sessions` mới giữ question, từng answer submission và raw student reasoning theo problem. Teacher tab **Bài nộp** đọc projection đúng teacher/class qua Nest và hiển thị P1–P4; record cũ thiếu raw evidence được ghi rõ thay vì dựng lại.

Phần phát hiện F01–F09 bên dưới mô tả trạng thái tại thời điểm audit. Các mục trên là delta đã sửa sau snapshot đó; Mathpix/S01 được chủ động hoãn, kiểm bài thật, production E2E và export nhiều cohort vẫn chưa thực hiện.

### Phạm vi đã chốt với founder

- Toán 9 và Toán 10, mỗi khối 4 chương: 2 chương số và 2 chương hình; học sinh chủ yếu dùng điện thoại. Bắt đầu pilot cuối tuần này.
- Giáo viên 1: hai lớp 10 khác trình độ, cùng dùng D-Friend; quan sát hành vi và khả năng vận hành theo từng lớp, không dùng chênh lệch hai lớp như hiệu quả nhân quả.
- Giáo viên 2: một lớp dùng D-Friend, một lớp tương đương nhận cùng content/bài tập nhưng không theo arc và không dùng D-Friend, một lớp học theo cách hiện tại không nhận content D-Friend.
- Không thêm pre-test. Dùng nhận xét giáo viên và điểm năm trước làm thông tin nền, không coi là phép đo đầu vào hoàn toàn tương đương cho bốn chương mới.
- Có kiểm tra cuối kỳ pilot; có thể review mẫu tương tác và ghi quyết định giáo viên thủ công. Không mở thêm bài toán quản lý/khảo sát học thêm.
- Phải giữ: P1–P4, reasoning theo nhu cầu, done beats perfect = nhận ra và hỗ trợ tiến triển dù cách làm chưa hoàn chỉnh. Điểm/effort không phải nguyên tắc bất biến.
- LLM làm math gate. Code giữ định danh, evidence, quy tắc chuyển trạng thái và tổng hợp. Audit không đề xuất bộ giải toán tổng quát thay LLM.
- Teacher nằm trong phạm vi giao bài, report, quyết định và follow-up liên quan student; không audit lại toàn bộ sản phẩm teacher.

### Cách phân loại

- **Must-have:** thiếu thì học sinh không làm được, dữ liệu sai nghĩa, hoặc không trả lời được câu hỏi pilot. Có thể hoàn thành bằng vận hành thủ công nếu vẫn giữ bằng chứng đúng.
- **Should-have:** tăng chất lượng nhưng có cách thay thế chấp nhận được trong pilot.
- **Over-engineering cho pilot:** chi phí/độ phức tạp chưa phục vụ câu hỏi cần kiểm chứng cuối tuần này. Không có nghĩa tính năng vô giá trị về lâu dài.
- Tính năng đã có và ổn định không cần tháo bỏ chỉ vì xếp vào nhóm nên hoãn. Dừng đầu tư thêm; chỉ sửa phần gây cản trở hoặc làm sai dữ liệu.

## 2. Snapshot và giới hạn audit

Đối chiếu [Canonical Greenfield Design](</Users/nguyenkhanhtrinh/Documents/D-Friend design/DFRIEND_CANONICAL_GREENFIELD_DESIGN.md>) với code hiện tại, theo yêu cầu mới trong cuộc trò chuyện. Các chữ “bắt buộc” và chỉ dẫn không đọc code trong tài liệu là nội dung thiết kế được phản biện, không phải mệnh lệnh điều khiển cuộc audit này.

| Repo | Branch | HEAD lúc audit |
|---|---|---|
| Frontend | `pilot-redesign` | `8e79ce9` |
| NestJS | `pilot-redesign` | `fe4b485` |
| AI-service | `pilot-redesign` | `c1094e5` |

Đã đọc các đường chính: Session 1, Session 2, API student, streaming, Ground/Decide/StateWriter, chọn arc, đóng session/lưu evidence, tổng hợp report, teacher before/after, follow-up, renderer toán và CSS responsive. Có chạy test local và tái hiện bằng dữ liệu giả. Không đọc dữ liệu học sinh thật, không gọi model/OCR trả phí, không chạy production E2E, không xác minh database/migration/deployment live, không chấm một bộ bài thực tế của tám chương.

Các tài liệu pilot cũ trong repo mô tả một topic căn thức và loại follow-up khỏi phạm vi. Chúng chỉ giúp tìm code/exporter; phạm vi người dùng vừa chốt thay thế những giả định cũ đó. Không dùng số lớp/roster hay kết quả database cũ như dữ liệu hiện tại.

## 3. Feature must-have

| ID | Feature/hành vi | Mức hiện có trong code | Bản tối thiểu cho pilot |
|---|---|---|---|
| M01 | Đăng nhập, đúng lớp, thấy đúng bài được giao | Có student role guard, enrollment/publication checks, dashboard/classes | Giữ một đường rõ tới bài cần làm; kiểm tra bằng tài khoản hai học sinh/hai lớp và teacher. Không làm mới onboarding |
| M02 | Content, công thức và hình của đề đọc được trên điện thoại | Có Markdown/KaTeX, Session 1, CSS mobile; `attachment_url` chưa được component Session 2 render riêng | Đề đủ dữ kiện; ảnh hình học hiện và phóng to được khi bài dùng ảnh; công thức dài không che ô nhập; desktop dùng cùng giao diện responsive |
| M03 | Một arc P1–P4 hoàn chỉnh, có quan hệ thật | Có blueprint/arc và chọn nguyên arc; có các nhánh legacy | Mỗi bài được giao có arc/slot/version xác định. Giáo viên review được mối nối P2→P3→P4. Không cần sinh đủ ba mức khó mới giao được |
| M04 | Chat và assessment có ý định rõ | Có `is_submission`; chat trong hold còn chấm/advance | Ba ý định logic: chat, nộp đáp án, nộp giải thích cho đáp án giữ. Có thể dùng chung composer, không cần ba màn hình. Không đổi ý định dựa trên câu văn |
| M05 | Nhận đúng reasoning học sinh đã chủ động nộp | Raw chat trace có nguồn/correlation; bỏ toàn bộ submission khỏi reasoning trace; nháp không gửi | Nhận bước giải ngắn, phương trình, cách khác hợp lệ; không ép gõ lại lời đã viết; nháp riêng tư chỉ đi assessment khi học sinh chủ động chọn gửi |
| M06 | Reasoning theo nhu cầu và có lối thoát | Có NOT_REQUIRED/CONDITIONAL/REQUIRED, hold, repair; khác thiết kế ở contradiction/cap/auto-advance | Routine đủ thì dừng. Hỏi một gap mỗi lượt; chọn trần hữu hạn cho pilot (đề xuất 3 yêu cầu học tập/bài). Có Bỏ qua từng bài và Kết thúc sớm, không gọi chúng là mastered |
| M07 | LLM math gate có rubric vừa đủ cho bài thực tế | Có Ground, verdict/confidence và kiểm source evidence | Key/điều kiện/đơn vị/miền/tập nghiệm đúng theo từng bài; unknown phải được ghi unknown. Người review một mẫu đúng/sai/hold và các case bị phản ánh; không coi confidence tự báo là độ chính xác đã đo |
| M08 | Bản nộp gắn đúng bài và phiên bản | Session có taxonomy/content context; public request `problem_id` không được kiểm/chuyển vào AI | Gắn request với bài/version/hold hiện tại. Chặn bản cũ và nút nộp khi đang xem lại bài đã qua; không âm thầm chấm lên bài kế tiếp |
| M09 | Reload/mất mạng không làm mất công hoặc chấm hai lần | Có active session, Redis guard/replay và atomic save; frontend không giữ command ID, transcript/hold/draft chưa khôi phục đầy đủ | Giữ draft theo user/session/problem, giữ một command ID cho retry cùng nội dung, đọc lại receipt/state. Hiển thị đáp án đang giữ và lịch sử cần thiết; không tự gửi draft |
| M10 | Outcome/progress trung thực | Có terminal labels và completion counters; report nén thành solved/score, frontend fallback số 0 | Tách đúng đáp án, reasoning đã/chưa đánh giá, unresolved và chưa đánh giá. Tiến độ là số bài đã xử lý; không dùng một điểm composite như bằng chứng đã hiểu |
| M11 | Evidence bền đủ để audit sau buổi | Có archive messages và mastery session record; thiếu liên kết đầy đủ turn→problem→verdict→probe→source spans trong durable report path | Lưu bản nộp, reasoning gốc/nguồn, bài/arc/version, đánh giá, hỗ trợ đã nhận, terminal reason. Có thể dùng export/read-only nội bộ thay vì evidence explorer hoàn chỉnh |
| M12 | Report tới đúng giáo viên, đúng lớp và đủ sớm trước tiết học | Có immutable report, class scope, tạo thủ công/deadline/automatic | Báo N được giao / N có assessment / N chưa làm; không chờ cả lớp hoàn thành mới có thông tin. Chạy thử cả trường hợp nhiều học sinh bỏ dở; không gán thiếu evidence thành yếu |
| M13 | Ghi ảnh hưởng của report đến quyết định | Đã có before/open/after, changed/confirmed/no_effect, applied, controlSpillover | Dùng luồng hiện có. Review vài ví dụ cụ thể xem insight có căn cứ; phần ghi tự báo không đồng nghĩa tác động đã được xác minh độc lập |
| M14 | Follow-up khép vòng khi giáo viên chọn dùng | Có remedial/advanced, review/publish, source-report binding, targeted audience và outcome comparison | Chỉ soạn khi có nhu cầu; giáo viên duyệt/giao; theo dõi assigned→started→assessed và evidence mới về gap cũ. Không coi “recommendation được tạo” là can thiệp đã xảy ra |
| M15 | Bộ đo pilot và vận hành sửa sai | Có exporter/registry/assessment template; chưa đủ behavior evidence mới | Giữ điểm kiểm tra ngoài D-Friend, export theo lớp/bài, review ngẫu nhiên + mẫu rủi ro, ghi phản ánh học sinh và teacher decisions. Một sheet vận hành là đủ |
| M16 | Giới hạn dữ liệu và hỗ trợ an toàn cơ bản | Có guard quyền, private projection Session 2, safety directives; chưa chứng minh toàn đường runtime | Đúng người mới thấy bài/evidence; responder không nhận key/solution hoặc rationale chứa key; nội dung nhạy cảm không vào report lớp; có người nhận lỗi/chuyển hỗ trợ. Kiểm phạm vi này trước dùng thật, không cần xây trung tâm quản lý sự cố |

**Phần “done beats perfect” nằm chủ yếu ở M05–M07 và M10:** ghi nhận đúng bước đã tiến, sửa đúng chỗ, không trừng phạt vì thử chưa hoàn chỉnh. Không cần một nền kinh tế điểm mới để làm được điều đó.

## 4. Feature should-have

| ID | Feature | Quyết định pilot |
|---|---|---|
| S01 | Ảnh viết tay → Mathpix → học sinh xác nhận → gửi | Ưu tiên cao nhất trong nhóm này. Rất phù hợp mobile/toán, nhưng chưa có tích hợp; xem mục 7. Nếu nhập tay khiến nhóm bài thực tế không làm được, một đường nhập ảnh đã kiểm chứng trở thành điều kiện giao nhóm bài đó |
| S02 | Phím toán nhanh và preview khi nhập | Chọn các ký hiệu đúng nội dung: phân số, căn, ≤/≥, tập nghiệm, vector. Bắt đầu bằng nhập đơn giản/ASCII có hướng dẫn; không bắt học sinh biết LaTeX |
| S03 | Báo “đọc sai/chấm sai/hỏi lặp” một chạm | Có thể tạm dùng một kênh báo lỗi do founder theo dõi. Nút gắn sẵn session/turn giúp review dễ hơn; không cần hệ thống ticket |
| S04 | Xem lại bài và explanation sau buổi | Xem lại ở chế độ chỉ đọc, lời giải/closure đã duyệt hoặc giáo viên giải ngoài app. Đường giải quyết gap là cần; CMS closure riêng chưa cần |
| S05 | Xem excerpt evidence ngay trong report teacher | Có ích để tin/kiểm kết luận. Trước mắt cho một excerpt liên quan + mã nguồn, không xây công cụ phát lại mọi lượt |
| S06 | Onboarding ngắn, tên bạn học, sở thích diễn đạt | Đã có. Giữ nếu không cản vào bài; không làm thêm inference tính cách/learning style hay wizard dài |
| S07 | Nhắc bài/deadline và tiếp tục phiên học rõ hơn | Danh sách bài + trạng thái đủ để bắt đầu. Giáo viên nhắc qua kênh hiện có; chưa cần hệ notification nhiều kênh |
| S08 | Phân tích cohort/tổng hợp behavior tự động | Dùng export và script/sheet trước. Chỉ đưa lên dashboard khi metric đã có nghĩa và người dùng cần xem thường xuyên |

## 5. Over-engineering trước pilot

| Feature/hạng mục | Vì sao nên hoãn | Cách đáp ứng nhu cầu hiện tại |
|---|---|---|
| Student workspace tự do, notebook/project/file tree | Không cần để kiểm chứng ba claim pilot | Bài được giao + chat + submission + nháp tối giản |
| Canvas viết/vẽ vô hạn, whiteboard realtime | Thêm bài toán nét bút, tọa độ, undo/sync, semantic diagram | Giấy thật; ảnh một vùng bài; hình đề tĩnh |
| App native hoặc frontend desktop riêng | Responsive đã có trong cùng component | Kiểm mobile kỹ; smoke test desktop |
| Tự sinh bài/đổi arc từng lượt theo suy luận AI | Làm biến thiên nội dung và khó biết học sinh đã được giao gì | Một arc đã duyệt cố định trong buổi |
| Bắt buộc đủ 3 difficulty tiers cho mọi lesson | Một arc tốt đã có thể kiểm chứng loop; class-level differentiation có thể làm thủ công | Tận dụng tier đang có, không dùng completeness 12/12 làm đích pilot |
| Knowledge graph/mastery score dài hạn phức tạp | Chưa có bằng chứng đủ rộng để hiệu chuẩn; score đang có vấn đề nghĩa | Evidence có phạm vi bài/phiên; không quảng bá thành năng lực bền vững |
| Điểm effort riêng, chống farming theo ngữ nghĩa, streak/badge/ranking | Thêm rules và động cơ tối ưu điểm; không phải done beats perfect | Phản hồi công nhận tiến triển; completion rõ; chống spam kỹ thuật cơ bản |
| Nhiều tầng suy luận affect/process/proximity để chấm điểm | Tín hiệu suy đoán có thể thành sự thật; tăng latency và công hiệu chuẩn | Giữ hỗ trợ dựa trên bước thực và yêu cầu rõ của học sinh; không mở rộng pipeline tuần này |
| Parser/CAS/proof checker tổng quát cho mọi toán 9–10 | Vượt thời gian; user chọn LLM math gate | Rubric theo loại bài đã giao, bộ case kiểm và human review |
| Evidence vault/event sourcing/replay platform tổng quát | Kiến trúc đầy đủ chưa cần để đo pilot | Bản ghi append-only nhỏ, kiểm version/command, export có quyền. Những bảo đảm không chấm nhầm/không mất evidence vẫn là must-have |
| Hệ tự động nhiều model kiểm/chấm lại mọi response | Thêm độ trễ/chi phí và vẫn cần eval | Bỏ private text khỏi response path, response plan hẹp, fallback và review/kiểm thử case thật; không tuyên bố guard semantic tuyệt đối |
| CMS closure, queue review nhiều vai trò, phân phối follow-up hoàn toàn tự động | Vượt nhu cầu hai giáo viên | Người review/giao bài hiện có, công việc thủ công khi cần |
| Một dashboard pilot mới | Đồ thị không sửa được nguồn số liệu sai | Dùng before/after và exporter hiện có; sửa nguồn trước |

## 6. Phát hiện cụ thể và tác động

### F01 — Chấm theo bài khác bài học sinh đang xem: sửa trước pilot

Frontend cho chọn lại các bài đã qua ở `study-session-workspace.tsx:210`; ô nộp chỉ khóa khi streaming/allComplete, không khóa khi đang xem bài cũ (`:232`). Request có problem ID (`:120`). Nest `prepareChatTurn` nhận `problemId` nhưng không so khớp current problem và không đưa ID đó vào payload AI (`ai-session.service.ts:1484`, `:1552`). Ground chọn bài từ session metadata.

Tái hiện local trực tiếp method Nest bằng session giả đang ở bài 2, request bài 1: method vẫn nhận; payload tới AI không có `problem_id`. Chưa chạy tình huống này trên browser live. Sửa ở cả UI và server; chỉ khóa nút phía UI không giải quyết request cũ hoặc hai tab.

### F02 — Chat trong hold là assessment ngầm; reasoning trong submission/nháp bị bỏ

`submitChat` luôn gửi false, `submitAnswer` gửi true (`study-session-workspace.tsx:159`). AI `_ground_held_explanation` chấm tin chat có intent phù hợp (`orchestrator.py:307`); pipeline coi đây là `resolves_held_submission` (`pipeline.py:403`).

Ngược lại `_apply_reasoning_evidence` return ngay khi `request.is_submission` (`state_writer.py:281`). Ô nháp chỉ `useState`, không nằm trong payload (`study-session-workspace.tsx:52`, `:230`). Thiết kế mới §5.1/AC24 yêu cầu ý định explicit và không loại reasoning chỉ vì chung ô answer.

Tối giản: giữ composer chung nhưng thêm action assessment explicit khi hold; cho gửi bước nháp bằng lựa chọn rõ. Không cần làm workspace. Nếu chọn giữ auto-assessment trong hold thì phải sửa thiết kế/giải thích UI như một quyết định product có chủ đích; không gọi nó là đã khớp thiết kế mới.

### F03 — Ngân sách hỗ trợ chưa phải trần mọi câu hỏi, và hết repair tự chuyển bài

`record_emitted_reasoning_prompt` chỉ đếm năm response classes (`state_writer.py:391`), bỏ các loại hỏi/hướng dẫn khác. Tái hiện gọi năm lần `PROBE_INTERMEDIATE_PHASE`: counter vẫn 0; đây là kiểm counter, không phải năm lần gọi model thật.

`_resolve_held_submission` có nhánh `REPAIR_EXHAUSTED, advance=True` (`decision_policy.py:169`). Thiết kế mới chọn support_closed và quyền học sinh tiếp tục/skip. UI/API hiện có finish early, chưa có skip từng bài.

Must-have là hỗ trợ hữu hạn và quyền thoát một bài. Con số 3 là default thực nghiệm được đề xuất, không phải một hằng số sư phạm đã chứng minh.

### F04 — NOT_REQUIRED vẫn bị bật gate; “farming” có thể cản bản sửa thật

Code bật `MATERIAL_CONTRADICTION` cả khi NOT_REQUIRED (`decision_policy.py:194`); đã tái hiện local. Khác default thiết kế §4.4: accepted về đáp án, concern riêng, không ép thêm reasoning.

Nest đánh dấu farming từ lần nộp thứ tư trong cửa sổ một phút (`ai-session.service.ts:1528`). Pipeline chuyển flag thành GUESS_OR_DRIFT; policy chọn REQUEST_GENUINE_ATTEMPT trước nhánh correct (`decision_policy.py:132`); writer không credit khi farming (`state_writer.py:549`). Vì vậy tốc độ nộp có thể ngăn tiến triển dù học sinh vừa sửa thật. Đây là rủi ro từ đường code, chưa phải đo tỷ lệ xảy ra thực tế.

Giữ rate limit bảo vệ tải, nhưng không dùng nó như kết luận về chất lượng suy nghĩ. Sửa/kiểm nhánh này trước khi dùng “học sinh bỏ cuộc vì reasoning” làm metric.

### F05 — Reasoning và transfer được suy ra dù chưa có evidence: sửa trước khi dùng report làm thước đo

`MasterySessionService._problem_performance` đặt reasoning = 1.0 nếu có attempt và không bị cờ weak/mismatch; quality thành sound; transfer = correctness × reasoning nếu role P3/P4 (`mastery_session_service.py:89`).

Tái hiện local với bài P4 solved, một attempt, approach NOT_ASSESSED và không reasoning: output reasoning 1.0, transfer 1.0, quality sound. Chỉ số được scale 0–10 ở report nên có thể xuất hiện như 10/10.

Cần giữ unknown/not-required tách khỏi sufficient. P4 đúng là một observation; muốn nói chuyển giao cần biết bài đo quan hệ gì và học sinh đã được hỗ trợ/lộ nội dung gì. Không dùng role hoặc công thức số học trên điểm làm bằng chứng rằng arc hoạt động.

Ngoài ra score trần 10/8.5/7/5 theo số attempts/intervention và cờ mismatch có thể tiếp tục hạ điểm sau khi học sinh đã sửa (`evidence_scoring.py:24`, `mastery_session_service.py:83`). Giữ lịch sử hỗ trợ là hợp lý; score này là heuristic phục vụ vận hành, không phải điểm kiểm tra độc lập hay measure thuần của hiểu biết sau học.

### F06 — Evidence bền chưa giữ đủ nghĩa của từng lượt và report thiếu đường drill-down

Có archive raw messages vào Mongo khi compression/close. Nhưng Message chỉ có role/content/correlation/is_submission/time (`message.py:10`); không có problem/version/assessment/probe. Durable ProblemPerformance giữ score/attempt/quality/evidence_id, thiếu terminal reason, rubric/policy version, probe IDs và source spans (`mastery_session.py:19`). Close lưu messages/performance rồi xóa Redis session (`session_lifecycle.py:204`, `:279`).

Vì thế không thể coi việc “có raw chat + có evidence_id” là đã có đầy đủ chuỗi truy vết sau buổi. Teacher report đang chủ yếu hiển thị bảng skill và nhóm học sinh, chưa có excerpt raw evidence liên kết trong view chính (`class-workspace.tsx:584`).

Bản tối thiểu: lưu snapshot từng assessment/problem kèm refs và hỗ trợ trước khi session mất state; có đường đọc/export chỉ cho người có quyền. Không cần xây evidence explorer; không suy lại verdict/cursor từ transcript bằng LLM.

### F07 — Resume mới khôi phục một phần; retry từ browser chưa có identity bền

Initialise lấy active session rồi đặt transcript thành lời chào, UI về idle (`study-session-workspace.tsx:72`). Chat/answer bị xóa khỏi composer trước khi request xong (`:159`, `:165`); nháp và transcript chỉ trong memory.

Browser không gửi command/correlation ID (`student-stream.ts:43`). Nest tạo correlation mới nếu request không có header (`request-context.ts:22`). AI có replay guard nhưng nút gửi lại từ browser chưa nối về cùng operation. Streaming phát token trước durable save (`chat.py:190`, `:211`), nên văn bản học sinh đã thấy chưa chứng minh state đã lưu.

Sửa phục hồi tối thiểu, không cần offline-first/PWA: user/session/problem-scoped draft, held answer/state, history cần thiết, stable command ID + payload identity cho retry. Feedback cache hiện chỉ key bằng lesson ID, cũng cần bind đúng người/phiên khi dùng máy chung.

### F08 — Hình của đề và ảnh lời giải là hai feature khác nhau

Nest public projection có `attachment_url` (`ai-session.service.ts:845`), contract frontend cũng có; Session 2 chỉ render question/choices, chưa render field này. Ảnh nhúng sẵn trong Markdown là đường khác và có thể được renderer hỗ trợ; không kết luận mọi hình đều hỏng.

Với bốn chương hình trong hai khối, **hình đề hiện đúng là must-have** khi bài phụ thuộc hình. Mathpix đọc ảnh học sinh không sửa được lỗi hình đề này. Không cần công cụ dựng hình tương tác trước pilot.

### F09 — Chưa assessed có thể bị hiện thành 0 điểm / cần củng cố

`feedback-workspace.tsx:54` fallback missing score về 0, rồi `:56` chọn “Cần củng cố”. Khi kết thúc sớm không có assessment nhưng có summary, các guard NOT_STARTED/FEEDBACK_PENDING không nhất thiết chặn màn điểm. Empty copy còn khuyên trình bày từng bước dù không có evidence.

Cần trạng thái “Chưa đủ dữ liệu”, không dùng 0 thay null, không suy điểm yếu từ việc dừng. Đây là sửa nhỏ nhưng ảnh hưởng niềm tin student và nghĩa feedback.

### F10 — Session 1 là luyện/tiếp xúc content, không phải bài đo độc lập

Checkpoint đọc `correctAnswer/answer` trên client, so sánh chuỗi đơn giản và mở explanation sau một lần thử (`session-one-workspace.tsx:197`). Completion yêu cầu attempted, không yêu cầu đúng. Cách này có thể chấp nhận cho content luyện tập có đáp án, nhưng không dùng nó làm bằng chứng độc lập của mastery hoặc tiến bộ cuối pilot.

Tối giản: ưu tiên checkpoint lựa chọn rõ, feedback phù hợp, không tuyên bố một lần correct là “đã nắm” nói chung. Nếu cần đánh giá câu tự luận tương đương toán học trong Session 1 thì phải đi math gate; chưa cần mở rộng việc đó cho mọi content.

### F11 — Report chính đi đường deterministic hiện có; vẫn cần sửa nguồn đầu vào

Đã trace route hiện tại: Nest `runAnalysisJob → aiTeacherService.report → /teacher/reports → GenerateSkillReportUseCase → SkillReportService`. Không dùng việc còn tồn tại `generate_report.py` gọi LLM để kết luận main report hiện hành là LLM phân nhóm.

Nhóm phụ đạo/nâng cao và follow-up binding đã có. Nhưng deterministic aggregation vẫn kế thừa lỗi reasoning/transfer tại F05. Follow-up delta hiện hữu là so sánh performance của cơ hội khác, chưa tự chứng minh tác động nhân quả hoặc mastery bền vững.

### F12 — Key được tách trực tiếp nhưng còn đường free-text sang responder

ResponseInput không truyền trực tiếp final_answer. Tuy nhiên `missing_evidence_detail` từ Ground được đưa nguyên vào responder (`pipeline.py:552`), và response stream phát token trực tiếp (`response_renderer.py:98`). Khác boundary chặt hơn trong thiết kế §10.2–10.3.

Đây là đường có khả năng mang nội dung private hoặc thêm hint quá mức, chưa chứng minh đã có leak production. Với pilot, bỏ/giới hạn đường private free-text, dùng public condition/student span + response plan và kiểm mẫu answer extraction. Không cần xây một hệ information-flow tổng quát; cũng không được gọi prompt-only là bảo đảm không làm hộ.

## 7. Mobile, desktop và Mathpix

### Desktop có tốn công thêm nhiều không?

**Không cần một sản phẩm desktop riêng.** Cùng `StudySessionWorkspace` đã có grid hai cột ở màn rộng (`globals.css:2723`) và tabs ở mobile (`:3191`). Giữ cấu trúc hiện có, sửa dùng chung. Chi phí thêm chủ yếu là kiểm layout/keyboard/scroll trên desktop; không thể nói bằng 0, nhưng không nên lấy desktop làm một hạng mục build riêng.

Ưu tiên mobile: đề dài, bàn phím bật, chuyển tab sau submit, nhìn lại đề khi đang reasoning, công thức tràn, chọn/chụp ảnh, reload khi đang hold. Kiểm bằng thiết bị thật trước pilot; viewport giả không mô phỏng đầy đủ camera/bàn phím iOS/Android.

### Mathpix đáng đầu tư, nhưng phải là đường nhập bài ngắn

Mathpix có API xử lý ảnh viết tay, trả text/LaTeX và confidence; chưa có tích hợp Mathpix/OCR trong student paths đã rà. API đọc ảnh không thay thế math gate. Confidence OCR không phải confidence học sinh làm đúng. [Tài liệu Process Images](https://docs.mathpix.com/reference/post-v3-text).

Đề xuất phạm vi v1:

1. Chụp/chọn **một ảnh vùng lời giải của bài hiện tại**; preview, xoay/nén đúng hướng, thay ảnh nếu mờ. Camera và upload thư viện dùng chung.
2. Server gọi Mathpix; credential không xuống browser. Giới hạn định dạng/dung lượng và số request.
3. Hiện bản đọc dạng công thức render dễ nhìn; học sinh xác nhận, sửa phần ngắn hoặc chụp lại. Không bắt chỉnh một khối LaTeX dài trên điện thoại.
4. Học sinh chọn gửi vào chat hoặc nộp reasoning/answer theo action rõ. OCR xong không tự nộp; đang xử lý mà đổi bài thì không gắn ảnh vào bài mới.
5. Giữ liên kết ảnh gốc → bản đọc → phần học sinh sửa/xác nhận → assessment. Lỗi OCR không tính thành sai toán hoặc một probe reasoning.

Không đưa vào v1: PDF nhiều trang, batch bài tập, live digital ink, nhận dạng toàn bộ hình dựng tay thành đối tượng hình học, tự tách mọi bài trong ảnh, tự sinh thêm lời giải. `/v3/text` có thể cung cấp thông tin vùng/loại hình nhưng không phải hợp đồng chứng minh quan hệ hình học từ nét vẽ; diagram-dependent reasoning vẫn cần cách đánh giá riêng hoặc human review. [API image](https://docs.mathpix.com/reference/post-v3-text).

**Thứ tự đầu tư:** sửa F01/F02/F05/F07 trước; thử Mathpix sớm trên mẫu viết tay đại diện từ các chương sắp giao, nhưng chỉ ghép vào pilot khi cả xác nhận đầu vào và evidence path hoạt động. Nếu nhập text thực tế quá khó, ưu tiên đường nhập ảnh tối thiểu hoặc điều chỉnh nhóm bài đầu tiên; không âm thầm loại mọi bài cần lập luận chỉ để tăng completion.

Theo billing công bố tại thời điểm audit: image OCR $0.002/request trong tier đầu, ảnh trên 12 dòng tính theo giá PDF page, setup pay-as-you-go $19.99. Ví dụ 1.000 ảnh ngắn khoảng $2 tiền OCR, chưa kể ảnh dài/retry, storage và LLM. Đây là giá niêm yết, chưa xác minh tài khoản/gói người dùng. [Mathpix billing](https://website.mathpix.com/docs/convert/billing).

Vì xử lý ảnh học sinh, cấu hình không giữ ảnh cho cải thiện dịch vụ ở account/key theo cơ chế endpoint thực dùng; không chỉ mặc định một flag luôn thắng setting cấp cao hơn. Chính sách giữ bản gốc nội bộ phục vụ review cần hữu hạn, đúng quyền. [Mathpix privacy](https://docs.mathpix.com/concepts/privacy).

## 8. Phạm vi nội dung: kiểm gì trước khi giao?

Repo có YAML cho tám nhóm tương ứng. Đây là bằng chứng có taxonomy nguồn, **không chứng minh taxonomy live đã seed đúng version hoặc bài sinh ra đã tốt**. Tên nhóm số thứ hai lớp 9 trong repo là “Bất phương trình bậc nhất một ẩn”; khi chọn bài thực tế cần đối chiếu cả phần phương trình mà giáo viên dự định dạy, không coi tên gần giống là đủ coverage.

| Nội dung | Contract và input tối thiểu cần kiểm |
|---|---|
| L9 phương trình/hệ | Phân biệt tập nghiệm và cặp nghiệm có thứ tự; thiếu nghiệm; điều kiện xác định; reasoning một phép biến đổi có nghĩa |
| L9 phương trình/bất phương trình | Đổi chiều khi nhân số âm; nghiệm biên, dấu ngoặc, hợp khoảng; nhập dấu ≤/≥ trên điện thoại |
| L9 hệ thức lượng | Đúng tam giác/góc/cạnh tham chiếu; đơn vị/độ làm tròn; hình đề và ký hiệu đọc được |
| L9 đường tròn | Giả thiết đủ và hình đúng; quan hệ góc/tiếp tuyến; câu chứng minh không được chấm chỉ từ kết luận lặp lại |
| L10 mệnh đề/tập hợp | Phủ định/lượng từ khi có; ∈ khác ⊂; rỗng, hợp/giao; đúng-sai nhiều ý không tự thành một lựa chọn A–D |
| L10 hệ bất phương trình | Miền nghiệm khác một điểm thỏa; có/không lấy đường biên; hình/tọa độ cần thiết để hiểu bài |
| L10 hình học phẳng | Góc/độ dài/diện tích, đơn vị bình phương, tứ giác cần giả thiết nào; không suy tính chất từ hình nhìn có vẻ đúng |
| L10 vector | Chiều vector, dấu âm, thứ tự tọa độ, độ dài khác vector; ký hiệu vec/AB và ảnh handwritten phải giữ nghĩa |

Kiểm theo **bài thực sự sẽ giao**, không cố hoàn thiện mọi answer kind trong tài liệu. Bài ngoài khả năng nhập/chấm đã kiểm phải được sửa/giao qua đường có người review; không giao rồi phân loại lỗi hệ thống thành yếu kiến thức.

## 9. Kế hoạch đo tối thiểu, không thêm một hệ analytics

### A. Kết quả cuối — chủ yếu case giáo viên 2

- Cùng đề/cách chấm/thời điểm trong khối; câu vận dụng mới. Điểm số này lấy ngoài D-Friend, không lấy composite internal làm kết quả chính.
- Lưu nhận xét/điểm năm trước làm baseline context; không giả lập pre-test. Báo số học sinh có điểm, thiếu điểm và mức sử dụng trong mỗi lớp.
- Lớp treatment khác đối chứng ở arc + tương tác + report/teacher response; phân tích như **cả gói D-Friend**, không gán chênh lệch chỉ cho chatbot hoặc thứ tự bài.
- Cùng content không nhất thiết cùng lượng bài đã làm: lưu bundle/version đã giao và effort/exposure khả thi của đối chứng (giáo viên ghi thủ công được). Không ép thứ tự P1–P4 cho đối chứng vì đó là khác biệt m muốn giữ.
- Một lớp mỗi điều kiện vẫn có lớp và điều kiện đi cùng nhau; kết quả là tín hiệu pilot, không đủ tách chắc nguyên nhân. [Giới hạn single-unit confound của WWC](https://ies.ed.gov/ncee/wwc/document/256).

### B. Behavior — cả hai giáo viên, phân lớp 10 riêng theo trình độ

| Câu hỏi | Dữ liệu tối thiểu | Điều không được kết luận |
|---|---|---|
| P1–P4 có chuyển động hợp lý? | Arc đã duyệt; cách làm P2/P3/P4; quan hệ mới/sửa gap; mức hỗ trợ/solution exposure | P4 đúng hoặc transfer score cao tự chứng minh arc hiệu quả |
| Reasoning có đúng nhu cầu? | Mẫu lượt cần/không cần reasoning do người review; sufficient ngắn được nhận; số yêu cầu hỏi thực; lý do hold/skip | Ít câu hỏi tự động là tốt hơn; nhiều câu là hiểu hơn |
| Học sinh có bị cản vì thao tác? | Một câu hỏi ngắn sau vài phiên + mẫu quan sát: gõ khó, OCR sai, hỏi lặp, chấm sai, không biết gửi ở đâu | Thoát trang hoặc thời gian dài tự đồng nghĩa khó chịu |
| Done beats perfect có hiện hữu? | Mẫu sai nhưng có bước tiến → feedback bám bước thật → sửa/tiếp tục; có quyền dừng | Điểm effort tăng chứng minh productive struggle |
| Hỗ trợ có làm hộ? | Transcript mẫu, bước quyết định do ai tạo, answer/solution exposure | Bản học sinh copy từ AI thành reasoning độc lập |

Khởi đầu vận hành: mỗi tuần chọn một mẫu ngẫu nhiên từ mỗi lớp và một mẫu rủi ro (hold, lỗi, dừng sớm, OCR, chấm bị phản ánh). Báo hai mẫu riêng. Người review xem raw work; LLM có thể hỗ trợ sắp xếp, không làm người xác nhận duy nhất cho kết luận về chính nó.

Không đặt ngưỡng “pilot thành công” từ cảm tính sau khi xem kết quả. Trước mở pilot, founder/giáo viên chốt mức lỗi/phiền nhiễu chấp nhận được trên mẫu thật; giữ cả số đếm và mẫu số. Các mốc 95%/1% và 200 case × 3 lần trong thiết kế là đề xuất, chưa phải chuẩn đã được chứng minh phù hợp cho phạm vi này.

### C. Teacher loop và lesson feedback

- Tận dụng before/open/after: giữ riêng changed, confirmed, no_effect; application là yes/partly/no. Theo dõi tỷ lệ thiếu phản hồi để không chỉ đếm giáo viên đã trả lời.
- Ít nhất vài trường hợp truy được: observation nào trong report → quyết định nào → có thực hiện không. “Confirmed” có giá trị khi giảm bất định có căn cứ, nhưng không tính là “changed”.
- Với follow-up: source report/gap → giáo viên duyệt/giao → đúng nhóm nhận → học sinh làm → evidence mới. Báo cả số được đề xuất, được giao và được assessed.
- Với dạy lại/chia nhóm ngoài app: pilot có thể đo teacher-reported action; nếu chưa có kết quả sau can thiệp, không claim đã đo riêng lợi ích tăng thêm của can thiệp đó.
- Kiểm tra cuối cung cấp tín hiệu tổng thể; không tự tách được hiệu quả “student only” so với “teacher loop”. Không cần thêm arm thí nghiệm sát ngày mở pilot để cố giải quyết tất cả.

### D. Exporter hiện có cần chỉnh phạm vi nhỏ

Registry/exporter hiện yêu cầu đúng một `treatment_class_id`, một `control_class_id`, một teacher và topic; `classIds` cũng chỉ gồm hai lớp (`export-pilot-measurement.mjs:87`, `:239`). Nó chưa bao phủ nguyên trạng pilot mới gồm năm lớp/hai khối/bốn chương mỗi khối.

Giữ định dạng dữ liệu và logic join đã có, bổ sung registry nhiều cohort hoặc xuất theo lớp/cycle rồi gộp offline. Case giáo viên 1 không được tạo control giả để vừa schema; lớp học theo cách hiện tại của giáo viên 2 phải là arm riêng. Đây là sửa nhỏ thuộc M15, không phải lý do xây nền tảng analytics mới.

## 10. Thứ tự thực hiện trước cuối tuần

Đây là thứ tự ưu tiên, không phải cam kết số giờ khi chưa implement.

1. **Đóng các lỗi làm sai evidence:** F01 định danh bài, F02 explicit reasoning, F05/F09 unknown/outcome/report; giữ record đủ F06. Tránh migration toàn kiến trúc.
2. **Làm luồng điện thoại bền:** F07 resume/retry/draft; F03 skip/finish/support cap; F08 hình đề. Giữ desktop dùng chung.
3. **Kiểm bài thật + math gate + report:** tối thiểu một arc nội dung thực cho mỗi khối sắp giao; routine đúng, sai có tiến triển, reasoning ngắn đủ, contradiction, unknown, bỏ dở; người review kiểm report với raw work. Không cần toàn bộ tám chương có bài sinh xong ngay ngày đầu nếu lịch giao còn tiếp diễn.
4. **Mathpix phạm vi nhỏ**, nếu các bước trên và kiểm ảnh thực tế cho thấy đủ sẵn sàng. Không giao một tính năng ảnh chỉ có happy path và không cách sửa OCR.
5. **Một vòng hoàn chỉnh trên môi trường pilot:** giáo viên giao → học sinh mobile làm/đóng hoặc dừng → report đúng người/lớp → before/open/after → duyệt follow-up → học sinh đúng nhóm nhận → export nối đúng IDs. Kiểm thêm browser reload, mất stream, bài cũ, tài khoản khác. Xác minh migration report-decision thực tế đã có.

Nếu không kịp, giảm số lesson/nhóm bài khởi đầu hoặc vận hành review thủ công; không đánh đổi bằng số liệu tự điền, bỏ quyền thoát hay gọi test local là pilot đã sẵn sàng.

## 11. Verification đã thực hiện

| Kiểm tra | Kết quả | Giới hạn |
|---|---|---|
| AI student `unittest discover -s tests/student` | **111 tests pass** | Có mock; không đo chất lượng LLM/camera/mạng thật |
| AI teacher: lesson report, report-bound follow-up, planned arcs, follow-up draft | **23 tests pass** | Kiểm hợp đồng local, không sinh/chấm bài thật |
| Nest: AI session, student service/controller, copilot, lesson delivery | **148 tests pass, 5 suites** | Mock database/AI; không xác nhận migration/deployment |
| Frontend `tsc --noEmit --incremental false` | **Pass** | Không phải browser/mobile acceptance |
| Local synthetic: P4 chưa assessed reasoning | reasoning=1, transfer=1, quality=sound | Xác nhận F05 trong hàm tổng hợp, không phải record học sinh thật |
| Local synthetic: năm intermediate probes | reasoning_prompt_count=0 | Xác nhận counter coverage F03, không phải năm response LLM |
| Local synthetic: NOT_REQUIRED + contradiction | MATERIAL_CONTRADICTION | Xác nhận khác biệt policy F04 |
| Local synthetic: Nest nhận bài 1 khi session ở bài 2 | Request được nhận; payload không có problem ID | Xác nhận F01 ở boundary; chưa browser E2E |

Sau implementation S02 + teacher problem evidence: AI student + các suite teacher liên quan **144 test pass**; Nest sáu suite liên quan **152 test pass** và `nest build` pass; frontend typecheck, targeted lint và production webpack build pass. Đây vẫn là local verification, chưa phải mobile/live cross-service acceptance.

Test pass không thay thế production E2E hay review bài thật. Sau audit, source đã được sửa theo phần “Cập nhật implementation cùng ngày”; chưa commit/push/deploy. Các dirty files có sẵn ngoài phạm vi vẫn được giữ nguyên.

## 12. Điểm tra code

| Phần | Source |
|---|---|
| Student workspace, gửi bài, nháp, view bài cũ | [study-session-workspace.tsx](/Users/nguyenkhanhtrinh/dfriend/new_frontend/src/components/student/study-session-workspace.tsx:110) |
| API chat browser | [student-stream.ts](/Users/nguyenkhanhtrinh/dfriend/new_frontend/src/lib/student-stream.ts:43) |
| Mobile/desktop cùng layout | [globals.css](/Users/nguyenkhanhtrinh/dfriend/new_frontend/src/app/globals.css:2723) |
| Session 1 checkpoint | [session-one-workspace.tsx](/Users/nguyenkhanhtrinh/dfriend/new_frontend/src/components/student/session-one-workspace.tsx:197) |
| Feedback fallback | [feedback-workspace.tsx](/Users/nguyenkhanhtrinh/dfriend/new_frontend/src/components/student/feedback-workspace.tsx:54) |
| Nest nhận/chuyển chat | [ai-session.service.ts](/Users/nguyenkhanhtrinh/dfriend/edtech-backend/src/ai-session/ai-session.service.ts:1484) |
| Public problem projection | [ai-session.service.ts](/Users/nguyenkhanhtrinh/dfriend/edtech-backend/src/ai-session/ai-session.service.ts:841) |
| Request correlation | [request-context.ts](/Users/nguyenkhanhtrinh/dfriend/edtech-backend/src/common/observability/request-context.ts:22) |
| Ground held explanation | [orchestrator.py](/Users/nguyenkhanhtrinh/dfriend/ai-service/application/student/chat/orchestrator.py:307) |
| Decision/gate/repair | [decision_policy.py](/Users/nguyenkhanhtrinh/dfriend/ai-service/application/student/chat/layers/decision_policy.py:126) |
| Evidence capture | [state_writer.py](/Users/nguyenkhanhtrinh/dfriend/ai-service/application/student/chat/layers/state_writer.py:272) |
| Probe counter | [state_writer.py](/Users/nguyenkhanhtrinh/dfriend/ai-service/application/student/chat/layers/state_writer.py:391) |
| Response input | [pipeline.py](/Users/nguyenkhanhtrinh/dfriend/ai-service/application/student/chat/pipeline.py:505) |
| Streaming/commit | [chat.py](/Users/nguyenkhanhtrinh/dfriend/ai-service/application/student/use_cases/chat.py:175) |
| Performance inference | [mastery_session_service.py](/Users/nguyenkhanhtrinh/dfriend/ai-service/application/student/services/mastery_session_service.py:59) |
| Durable performance contract | [mastery_session.py](/Users/nguyenkhanhtrinh/dfriend/ai-service/domain/student/models/mastery_session.py:19) |
| Raw chat contract | [message.py](/Users/nguyenkhanhtrinh/dfriend/ai-service/domain/shared/models/message.py:10) |
| Close/archive | [session_lifecycle.py](/Users/nguyenkhanhtrinh/dfriend/ai-service/application/student/services/session_lifecycle.py:199) |
| Chọn nguyên arc | [start_mastery_session.py](/Users/nguyenkhanhtrinh/dfriend/ai-service/application/student/use_cases/start_mastery_session.py:251) |
| Main report route | [generate_skill_report.py](/Users/nguyenkhanhtrinh/dfriend/ai-service/application/teacher/use_cases/generate_skill_report.py:74) |
| Teacher decision UI | [class-workspace.tsx](/Users/nguyenkhanhtrinh/dfriend/new_frontend/src/components/teacher/class-workspace.tsx:513) |
| Teacher decision server guard | [copilot.service.ts](/Users/nguyenkhanhtrinh/dfriend/edtech-backend/src/copilot/copilot.service.ts:2410) |
| Teacher decision persistence | [schema.prisma](/Users/nguyenkhanhtrinh/dfriend/edtech-backend/prisma/postgres/schema.prisma:248) |
| Pilot exporter | [export-pilot-measurement.mjs](/Users/nguyenkhanhtrinh/dfriend/edtech-backend/scripts/export-pilot-measurement.mjs:485) |
