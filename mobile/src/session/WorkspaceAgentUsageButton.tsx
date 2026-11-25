import { useCallback, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { Gauge } from 'lucide-react-native'
import { hasUsageData } from '../../../src/shared/agent-usage/display/usage-provider-windows'
import { ProviderRateLimitsSchema } from '../accounts/accounts-snapshot'
import { ProviderUsageWindows } from '../accounts/ProviderUsageWindows'
import { UsageStatusNote } from '../accounts/usage/UsageStatusNote'
import { useMobileAccountsSnapshot } from '../accounts/use-mobile-accounts-snapshot'
import { BottomDrawer } from '../components/bottom-drawer/BottomDrawer'
import { NavBarButton } from '../components/nav-bar/NavBarButton'
import { SheetHeader } from '../components/nav-bar/SheetHeader'
import { useNow } from '../hooks/use-now'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { colors, spacing, typography } from '../theme/mobile-theme'
import { themedStyleSheet } from '../theme/themed-styles'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import type { MobileSessionController } from './use-mobile-session-controller'

type UsageSource = Pick<
  MobileSessionController,
  'hostId' | 'client' | 'connState' | 'lastConnectedAt'
>

const PROVIDERS = [
  ['codex', 'Codex'],
  ['claude', 'Claude Code'],
  ['antigravity', 'Antigravity']
] as const

export function WorkspaceAgentUsageButton(source: UsageSource) {
  const t = useMobileTranslation()
  const [open, setOpen] = useState(false)
  const title = t('session.agentUsage.title', 'Agent usage')
  const close = useCallback(() => setOpen(false), [])
  return (
    <>
      <NavBarButton
        icon={Gauge}
        accessibilityLabel={title}
        active={open}
        onPress={() => setOpen(true)}
      />
      <BottomDrawer visible={open} onClose={close} contentScrollable>
        <SheetHeader title={title} onClose={close} />
        <WorkspaceAgentUsage source={source} />
      </BottomDrawer>
    </>
  )
}

function WorkspaceAgentUsage({ source }: { source: UsageSource }) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const { snapshot, live, error } = useMobileAccountsSnapshot(source)
  const now = useNow(60_000)
  const limitsByProvider = live ? snapshot?.rateLimits : undefined
  // Older clients preserve providers outside the typed Claude/Codex slots as unknown fields.
  const antigravity = ProviderRateLimitsSchema.safeParse(limitsByProvider?.antigravity)
  const antigravityLimits =
    antigravity.success && antigravity.data.provider === 'antigravity' ? antigravity.data : null
  return (
    <View style={styles.body}>
      <Text style={styles.note}>
        {t('session.agentUsage.scope', 'Active accounts on the paired computer')}
      </Text>
      {source.connState !== 'connected' ? (
        <Text style={styles.note}>
          {t('session.agentUsage.disconnected', 'Connect to the computer to see usage.')}
        </Text>
      ) : !limitsByProvider ? (
        error ? (
          <Text style={styles.note}>
            {t('session.agentUsage.loadFailed', 'Couldn’t load usage from the paired computer.')}
          </Text>
        ) : (
          <ActivityIndicator
            accessibilityLabel={t('session.agentUsage.loading', 'Loading usage')}
            color={colors.textSecondary}
          />
        )
      ) : (
        PROVIDERS.map(([id, name]) => {
          const limits = id === 'antigravity' ? antigravityLimits : limitsByProvider[id]
          const hasWindows = limits && hasUsageData(limits)
          return (
            <View key={id} style={styles.provider}>
              <Text style={styles.name}>{name}</Text>
              {hasWindows ? <ProviderUsageWindows limits={limits} now={now} /> : null}
              {limits?.error ? (
                <UsageStatusNote limits={limits} />
              ) : !hasWindows ? (
                <Text style={styles.note}>
                  {limits?.status === 'fetching'
                    ? t('session.agentUsage.loading', 'Loading usage')
                    : t('session.agentUsage.unavailable', 'No quota reported')}
                </Text>
              ) : null}
            </View>
          )
        })
      )}
    </View>
  )
}

const styles = themedStyleSheet(() => ({
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  provider: { gap: spacing.xs },
  name: { color: colors.textPrimary, fontSize: typography.bodySize, fontWeight: '600' },
  note: { color: colors.textSecondary, fontSize: typography.metaSize }
}))
