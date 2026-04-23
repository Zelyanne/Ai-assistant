import type { ConversationListItem } from '../../composables/useCommandCenter';
type __VLS_Props = {
    conversations: ConversationListItem[];
    activeConversationId: string | null;
    disabled?: boolean;
};
declare const _default: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    newChat: () => any;
    selectConversation: (conversationId: string) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{
    onNewChat?: (() => any) | undefined;
    onSelectConversation?: ((conversationId: string) => any) | undefined;
}>, {
    disabled: boolean;
    conversations: ConversationListItem[];
    activeConversationId: string | null;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
export default _default;
