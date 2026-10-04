import { LabIcon } from '@jupyterlab/ui-components';

import chatSvg from '../style/icons/chat.svg';
import graphitSvg from '../style/icons/graphit.svg';

export const graphitIcon = new LabIcon({
  name: 'graphit:icon',
  svgstr: graphitSvg
});

export const graphitChatIcon = new LabIcon({
  name: 'graphit:chat-icon',
  svgstr: chatSvg
});
