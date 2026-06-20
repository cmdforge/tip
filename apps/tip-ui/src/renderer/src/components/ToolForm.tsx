import { Alert, Button, Code, Group, Paper, Stack, Text } from "@mantine/core";
import Form, { type IChangeEvent } from "@rjsf/core";
import validator from "@rjsf/validator-ajv8";
import type { Tool } from "@modelcontextprotocol/sdk/types";
import { useEffect, useState } from "react";
import { useMcpClient } from "../context/mcpClient";

type FormData = Record<string, unknown>;

type UiSchema = Record<string, unknown>;

function createUiSchema(tool: Tool): UiSchema {
  return Object.fromEntries(
    Object.entries(tool.inputSchema.properties ?? {}).map(([key, rawProperty]) => {
      const property = rawProperty as {
        type?: string | string[];
      };
      const type = Array.isArray(property.type) ? property.type[0] : property.type;

      if (type === "object" || type === "array") {
        return [
          key,
          {
            "ui:widget": "textarea",
          },
        ];
      }

      return [key, {}];
    }),
  );
}

export function ToolForm({ selectedTool }: { selectedTool: Tool }) {
  const client = useMcpClient();
  const [formData, setFormData] = useState<FormData>({});
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setFormData({});
    setResult(null);
    setError(null);
  }, [selectedTool]);

  async function handleSubmit(event: IChangeEvent<FormData>) {
    setIsSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const toolResult = await client.callTool({
        name: selectedTool.name,
        arguments: event.formData,
      });

      setResult(toolResult.structuredContent ?? toolResult.content);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Failed to execute tool.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Paper className="border border-stone-200 shadow-sm" p="md" radius="md">
      <Stack gap="md">
        <Stack gap={4}>
          <Text fw={600}>{selectedTool.title ?? selectedTool.name}</Text>
          {selectedTool.description ? <Text>{selectedTool.description}</Text> : null}
        </Stack>

        <Form<FormData>
          disabled={isSubmitting}
          formData={formData}
          noHtml5Validate
          schema={selectedTool.inputSchema}
          uiSchema={createUiSchema(selectedTool)}
          validator={validator as never}
          onChange={(event) => setFormData(event.formData ?? {})}
          onSubmit={handleSubmit}
        >
          <Group justify="flex-end">
            <Button color="dark" loading={isSubmitting} type="submit">
              Run tool
            </Button>
          </Group>
        </Form>

        {error ? (
          <Alert color="red" title="Tool failed" variant="light">
            {error}
          </Alert>
        ) : null}

        {result ? (
          <Code block>{JSON.stringify(result, null, 2)}</Code>
        ) : null}
      </Stack>
    </Paper>
  );
}
