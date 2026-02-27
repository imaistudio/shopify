import { useState } from "react";
import {
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Button,
  Banner,
  Badge,
  Spinner,
  Link,
  Modal,
} from "@shopify/polaris";

interface SettingsBlockProps {
  isConnected: boolean;
  maskedKey: string | null;
  balance: number | null;
  onSaveKey: (apiKey: string) => void;
  onRemoveKey: () => void;
  isLoading: boolean;
  error?: string;
  onKeySaved: () => void;
}

export function SettingsBlock({
  isConnected,
  maskedKey,
  balance,
  onSaveKey,
  onRemoveKey,
  isLoading,
  error,
}: SettingsBlockProps) {
  const [apiKey, setApiKey] = useState("");
  const [showRemoveModal, setShowRemoveModal] = useState(false);

  const handleConnect = () => {
    if (apiKey.trim()) {
      onSaveKey(apiKey.trim());
    }
  };

  const handleRemove = () => {
    setShowRemoveModal(true);
  };

  const confirmRemove = () => {
    onRemoveKey();
    setShowRemoveModal(false);
    setApiKey("");
  };

  if (isConnected) {
    return (
      <BlockStack gap="400">
        <InlineStack gap="200" blockAlign="center">
          <Badge tone="success">Connected</Badge>
          <Text variant="headingMd">Connected to IMAI Studio</Text>
        </InlineStack>

        <BlockStack gap="200">
          <InlineStack gap="200">
            <Text variant="bodyMd" tone="subdued">
              API Key
            </Text>
            <Text variant="bodyMd" fontWeight="medium">
              {maskedKey}
            </Text>
          </InlineStack>

          <InlineStack gap="200">
            <Text variant="bodyMd" tone="subdued">
              Credits
            </Text>
            <Text variant="bodyMd" fontWeight="medium">
              {balance?.toLocaleString()} remaining
            </Text>
          </InlineStack>
        </BlockStack>

        <Button tone="critical" variant="plain" onClick={handleRemove}>
          Remove Key
        </Button>

        <Modal
          open={showRemoveModal}
          onClose={() => setShowRemoveModal(false)}
          title="Remove API Key?"
          primaryAction={{
            content: "Remove Key",
            tone: "critical",
            onAction: confirmRemove,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => setShowRemoveModal(false),
            },
          ]}
        >
          <Modal.Section>
            <Text>
              This will disconnect your IMAI Studio account. You will need to
              reconnect to generate images again.
            </Text>
          </Modal.Section>
        </Modal>
      </BlockStack>
    );
  }

  return (
    <BlockStack gap="400">
      <Text variant="headingMd">Connect IMAI Studio</Text>

      <Text variant="bodyMd">
        Get your API key at{" "}
        <Link url="https://www.imai.studio" target="_blank">
          www.imai.studio
        </Link>{" "}
        → Settings
      </Text>

      {error && (
        <Banner tone="critical" title="Error">
          {error}
        </Banner>
      )}

      {isLoading ? (
        <InlineStack gap="200" blockAlign="center">
          <Spinner size="small" />
          <Text>Validating key...</Text>
        </InlineStack>
      ) : (
        <>
          <TextField
            label="API Key"
            value={apiKey}
            onChange={setApiKey}
            autoComplete="off"
            placeholder="sk_live_xxxxx"
          />

          <Button
            variant="primary"
            onClick={handleConnect}
            disabled={!apiKey.trim()}
          >
            Connect
          </Button>
        </>
      )}
    </BlockStack>
  );
}
