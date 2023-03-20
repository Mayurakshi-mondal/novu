import React, { ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { INotificationTemplateStep, IUpdateNotificationTemplateDto, StepTypeEnum } from '@novu/shared';

import { testTrigger } from '../../api/notification-templates';
import { useAuthContext } from '../providers/AuthProvider';
import { useDebounce } from '../../hooks';
import { useTemplateFetcher, useUpdateTemplate } from '../../api/hooks';

interface DigestDemoFlowProviderState {
  isRunningDigest: boolean;
  triggerCount: number;
  digestInterval: number;
  emailsSentCount: number;
  hoveredHintId?: string;
}

interface DigestDemoFlowContextProps {
  isReadOnly: boolean;
  isRunningDigest: boolean;
  digestInterval: number;
  triggerCount: number;
  emailsSentCount: number;
  hoveredHintId?: string;
  updateDigestInterval: (interval: number) => void;
  runTrigger: () => void;
  setHoveredHintId: (hintId?: string) => void;
}

const DigestDemoFlowContext = React.createContext<DigestDemoFlowContextProps>({
  isReadOnly: true,
  isRunningDigest: true,
  digestInterval: 10,
  triggerCount: 0,
  emailsSentCount: 0,
  updateDigestInterval: (interval: number) => {},
  runTrigger: () => {},
  setHoveredHintId: (hintId?: string) => {},
});

export const useDigestDemoFlowContext = () => useContext(DigestDemoFlowContext);

export const DigestDemoFlowProvider = ({
  children,
  isReadOnly,
  templateId,
}: {
  children: ReactNode;
  isReadOnly: boolean;
  templateId?: string;
}) => {
  const [{ isRunningDigest, triggerCount, digestInterval, emailsSentCount, hoveredHintId }, setState] =
    useState<DigestDemoFlowProviderState>({
      isRunningDigest: false,
      triggerCount: 0,
      digestInterval: 10,
      emailsSentCount: 0,
    });
  const { currentUser } = useAuthContext();
  const { template } = useTemplateFetcher(
    { templateId },
    {
      enabled: !isReadOnly && !!templateId,
      refetchOnWindowFocus: false,
      onSuccess: (fetchedTemplate) => {
        const digest: INotificationTemplateStep | undefined = fetchedTemplate.steps.find(
          (step) => step.template?.type === StepTypeEnum.DIGEST
        );
        if (digest) {
          setState((state) => ({ ...state, digestInterval: digest.metadata?.amount ?? 10 }));
        }
      },
    }
  );
  const { updateTemplateMutation } = useUpdateTemplate();
  const debouncedUpdateTemplate = useDebounce(
    (args: { id: string; data: Partial<IUpdateNotificationTemplateDto> }) => updateTemplateMutation(args),
    1000
  );
  const { mutateAsync: testTriggerMutation } = useMutation(testTrigger);

  const updateDigestInterval = useCallback(
    (interval: number) => {
      setState((state) => ({ ...state, digestInterval: interval }));

      if (template && template._id) {
        const steps = template.steps.map((step) => {
          if (step.template?.type === StepTypeEnum.DIGEST) {
            return { ...step, metadata: { ...step.metadata, amount: interval } };
          }

          return step;
        });

        debouncedUpdateTemplate({ id: template._id, data: { steps } });
      }
    },
    [debouncedUpdateTemplate, template]
  );

  const runTrigger = useCallback(() => {
    if (template && currentUser) {
      setState((state) => ({ ...state, triggerCount: state.triggerCount + 1 }));

      testTriggerMutation({
        name: template.triggers[0].identifier,
        to: [
          {
            subscriberId: currentUser._id,
            email: currentUser.email,
          },
        ],
        payload: {},
        overrides: {},
      });
    }
  }, [template, currentUser]);

  const startDigestTimer = useCallback(() => {
    setTimeout(() => {
      setState((state) => ({
        ...state,
        isRunningDigest: false,
        triggerCount: 0,
        emailsSentCount: state.emailsSentCount + 1,
      }));
    }, digestInterval * 1000);
  }, [digestInterval]);

  const setHoveredHintId = useCallback((hintId?: string) => {
    setState((state) => ({
      ...state,
      hoveredHintId: hintId,
    }));
  }, []);

  useEffect(() => {
    if (template && !isRunningDigest && triggerCount > 0) {
      setState((state) => ({ ...state, isRunningDigest: true }));

      startDigestTimer();
    }
  }, [template, isRunningDigest, triggerCount, startDigestTimer]);

  const value = useMemo(
    () => ({
      isReadOnly,
      isRunningDigest,
      digestInterval,
      triggerCount,
      emailsSentCount,
      hoveredHintId,
      updateDigestInterval,
      runTrigger,
      setHoveredHintId,
    }),
    [
      isReadOnly,
      isRunningDigest,
      digestInterval,
      triggerCount,
      emailsSentCount,
      hoveredHintId,
      updateDigestInterval,
      runTrigger,
      setHoveredHintId,
    ]
  );

  return <DigestDemoFlowContext.Provider value={value}>{children}</DigestDemoFlowContext.Provider>;
};
