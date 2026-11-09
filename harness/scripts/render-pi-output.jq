def duration:
  if (.durationMs? | type) == "number" then " (\(.durationMs) ms)" else "" end;

def compact_args:
  (.args | tojson) as $args |
  if ($args | length) > 500 then "\($args[0:500])… [arguments truncated]" else $args end;

def result_text:
  [.result.content[]? |
    if .type == "text" then .text
    elif .type == "image" then "[image: \(.mimeType // "unknown")]"
    elif .type == "audio" then "[audio: \(.mimeType // "unknown")]"
    else empty
    end
  ] | join("\n");

if .type == "message_update" then
  .assistantMessageEvent |
  if .type == "thinking_start" then "\nThinking:\n"
  elif .type == "thinking_delta" then .delta
  elif .type == "thinking_end" then "\n"
  elif .type == "text_start" then "\nAssistant:\n"
  elif .type == "text_delta" then .delta
  elif .type == "text_end" then "\n"
  else empty
  end
elif .type == "tool_execution_start" then
  "\nTool: \(.toolName)\n\(compact_args)\n"
elif .type == "tool_execution_end" then
  (result_text) as $result |
  (if $result == "" then "\n" else "\n\($result)\n" end) +
  (if .isError then "✗" else "✓" end) + " \(.toolName)" + duration + "\n"
elif .type == "auto_retry_start" then
  "\nRetry \(.attempt)/\(.maxAttempts): \(.errorMessage)\n"
elif .type == "compaction_start" then
  "\nCompacting context (\(.reason))...\n"
elif .type == "compaction_end" then
  if .aborted then "Compaction aborted.\n"
  elif .errorMessage? then "Compaction failed: \(.errorMessage)\n"
  else "Compaction complete.\n"
  end
else
  empty
end
