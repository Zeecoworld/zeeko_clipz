import React from 'react';
import {Composition} from 'remotion';
import {Code} from './templates/Code';
import {Myth} from './templates/Myth';
import {Tips} from './templates/Tips';
import {Versus} from './templates/Versus';
import {loadFonts} from './lib/theme';
import {FPS, HEIGHT, WIDTH, totalFrames} from './timing.mjs';
import type {ShortProps, Spec} from './types';

loadFonts();

const Short: React.FC<ShortProps> = ({spec}) => {
  switch (spec.template) {
    case 'tips':
      return <Tips spec={spec} />;
    case 'myth':
      return <Myth spec={spec} />;
    case 'code':
      return <Code spec={spec} />;
    case 'versus':
      return <Versus spec={spec} />;
  }
};

const common = {accent: 0, music: 0, brand: 'Zeecomedia Tech', cta: 'Follow for daily coding tips'};

// Only used when previewing in Remotion Studio. The factory passes real scripts in.
export const SAMPLE: Spec = {
  ...common,
  template: 'tips',
  label: 'Coding tip',
  hook: '4 habits that make you a faster developer',
  items: [
    {heading: 'Read the error message', detail: 'Most bugs explain themselves in the first line of the error.'},
    {heading: 'Commit small and often', detail: 'Small commits are easy to review and easy to undo.'},
    {heading: 'Name things clearly', detail: 'A good name removes the need for a comment.'}
  ]
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Short"
    component={Short}
    width={WIDTH}
    height={HEIGHT}
    fps={FPS}
    durationInFrames={totalFrames(SAMPLE)}
    defaultProps={{spec: SAMPLE}}
    calculateMetadata={({props}) => ({durationInFrames: totalFrames(props.spec)})}
  />
);
