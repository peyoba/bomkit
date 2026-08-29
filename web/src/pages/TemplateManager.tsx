/**
 * 输出模板管理页（独立入口）：上传并标注公司模板、管理已保存模板。
 * 标注是一次性的配置动作，不放在转换向导内；向导「输出模板」步骤只从
 * 内置默认 + 此处保存的公司模板中选择（2026-08-29 用户决定）。
 */
import { useCallback, useEffect, useState } from "react";
import { Button, Card, List, Popconfirm, Typography } from "antd";
import { TemplateAnnotator } from "../components/TemplateAnnotator";
import { deleteProfile, listProfiles } from "../lib/profiles";
import { isBuiltinProfile } from "../lib/profileGuard";
import type { OutputTemplateProfile } from "../types/contracts";

export function TemplateManager({ onBack }: { onBack: () => void }) {
  const [saved, setSaved] = useState<OutputTemplateProfile[]>([]);

  const refresh = useCallback(() => {
    setSaved(
      listProfiles("output_template").filter(
        (p): p is OutputTemplateProfile => p.kind === "output_template" && !isBuiltinProfile(p)
      )
    );
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div style={{ maxWidth: 1100, margin: "32px auto", padding: "0 24px" }}>
      <Button onClick={onBack} style={{ marginBottom: 16 }}>
        ← 返回首页
      </Button>
      <Typography.Title level={3}>标注输出模板</Typography.Title>
      <Typography.Paragraph type="secondary">
        上传公司现有 BOM 模板，点选数据起始行并标注列对应关系，保存后即可在转换向导的
        「输出模板」步骤选用。模板只保存在本机浏览器，不会上传。
      </Typography.Paragraph>

      <Card title="新建 / 修改标注" style={{ marginBottom: 24 }}>
        <TemplateAnnotator onChange={refresh} />
      </Card>

      <Card title="已保存的公司模板">
        {saved.length === 0 ? (
          <Typography.Text type="secondary">还没有保存的模板，先在上方上传并标注一个。</Typography.Text>
        ) : (
          <List
            dataSource={saved}
            renderItem={(p) => (
              <List.Item
                actions={[
                  <Popconfirm
                    key="del"
                    title="确定删除这个模板？"
                    onConfirm={() => {
                      deleteProfile("output_template", p.id);
                      refresh();
                    }}
                  >
                    <Button danger size="small">
                      删除
                    </Button>
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  title={p.name || "未命名输出模板"}
                  description={`数据起始行：第 ${p.data_start_row} 行 · 保存在本机`}
                />
              </List.Item>
            )}
          />
        )}
      </Card>
    </div>
  );
}
