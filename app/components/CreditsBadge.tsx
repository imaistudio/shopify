import { Badge, InlineStack, Spinner, Text } from "@shopify/polaris";

interface CreditsBadgeProps {
  balance: number | null;
  isLoading: boolean;
}

export function CreditsBadge({ balance, isLoading }: CreditsBadgeProps) {
  if (isLoading) {
    return (
      <InlineStack gap="200" blockAlign="center">
        <Spinner size="small" />
        <Text>Loading credits...</Text>
      </InlineStack>
    );
  }

  if (balance === null) return null;

  const tone = balance > 500 ? "success" : balance > 100 ? "warning" : "critical";

  return (
    <Badge tone={tone}>
      {balance.toLocaleString()} credits
    </Badge>
  );
}
