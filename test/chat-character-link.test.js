import { describe, expect, it } from 'vitest';
import {
  characterBaseName,
  chatOwnerName,
  chatOwnerOfDirNode,
  counterpartsOf,
  annotateChatLinks,
  nodeHubPath,
} from '../src/core/chart-model.js';

/** 一棵最小可用的「角色卡 + 聊天目录」树。 */
function sampleTree() {
  return [
    {
      id: 'group:characters',
      label: 'Characters',
      children: [
        { id: 'leaf:characters/Foo.png', label: 'Foo.png', leaf: true, path: 'characters/Foo.png', children: [] },
        { id: 'leaf:characters/Bar.png', label: 'Bar.png', leaf: true, path: 'characters/Bar.png', children: [] },
      ],
    },
    {
      id: 'group:chats',
      label: 'Chats',
      children: [
        {
          id: 'dir:chats:chats/Foo',
          label: 'Foo',
          children: [
            { id: 'leaf:chats/Foo/a.jsonl', label: 'a.jsonl', leaf: true, path: 'chats/Foo/a.jsonl', children: [] },
          ],
        },
        {
          id: 'dir:chats:chats/Baz',
          label: 'Baz',
          children: [
            { id: 'leaf:chats/Baz/b.jsonl', label: 'b.jsonl', leaf: true, path: 'chats/Baz/b.jsonl', children: [] },
          ],
        },
      ],
    },
  ];
}

describe('角色卡与聊天记录的命名匹配', () => {
  it('characterBaseName 只认 characters/ 下的一级文件并去掉扩展名', () => {
    expect(characterBaseName('characters/Foo.png')).toBe('Foo');
    expect(characterBaseName('data/default-user/characters/Foo Bar.png')).toBe('Foo Bar');
    expect(characterBaseName('characters/sub/Foo.png')).toBe('');
    expect(characterBaseName('settings.json')).toBe('');
    expect(characterBaseName('')).toBe('');
  });

  it('chatOwnerName 取 chats/<name>/ 的首段', () => {
    expect(chatOwnerName('chats/Foo/a.jsonl')).toBe('Foo');
    expect(chatOwnerName('data/default-user/chats/Foo/a.jsonl')).toBe('Foo');
    expect(chatOwnerName('chats/a.jsonl')).toBe('');
    expect(chatOwnerName('characters/Foo.png')).toBe('');
  });

  it('chatOwnerOfDirNode 同时认「含分组前缀」与「组内相对」两种 id', () => {
    expect(chatOwnerOfDirNode({ id: 'dir:chats:chats/Foo' })).toBe('Foo');
    expect(chatOwnerOfDirNode({ id: 'dir:chats:Foo' })).toBe('Foo');
    expect(chatOwnerOfDirNode({ id: 'dir:chats:chats' })).toBe('');
    expect(chatOwnerOfDirNode({ id: 'dir:characters:characters/Foo' })).toBe('');
  });

  it('nodeHubPath 对目录节点从 id 反推路径', () => {
    expect(nodeHubPath({ path: 'characters/Foo.png' })).toBe('characters/Foo.png');
    expect(nodeHubPath({ id: 'dir:chats:chats/Foo' })).toBe('chats/Foo');
    expect(nodeHubPath({ id: 'leaf:characters/Foo.png' })).toBe('characters/Foo.png');
    expect(nodeHubPath({})).toBe('');
  });
});

describe('counterpartsOf 双向联动', () => {
  it('勾角色卡 → 只带出同名聊天根目录', () => {
    const tree = sampleTree();
    const card = tree[0].children[0];
    const linked = counterpartsOf(tree, card);
    expect(linked.map((n) => n.id)).toEqual(['dir:chats:chats/Foo']);
  });

  it('勾聊天目录 → 带出同名角色卡', () => {
    const tree = sampleTree();
    const dir = tree[1].children[0];
    expect(counterpartsOf(tree, dir).map((n) => n.id)).toEqual(['leaf:characters/Foo.png']);
  });

  it('勾单个聊天文件 → 带出同名角色卡', () => {
    const tree = sampleTree();
    const chatFile = tree[1].children[0].children[0];
    expect(counterpartsOf(tree, chatFile).map((n) => n.id)).toEqual(['leaf:characters/Foo.png']);
  });

  it('没有对端时返回空数组，不瞎猜', () => {
    const tree = sampleTree();
    expect(counterpartsOf(tree, tree[0].children[1])).toEqual([]);
    expect(counterpartsOf(tree, tree[1].children[1])).toEqual([]);
  });
});

describe('annotateChatLinks 未匹配标注', () => {
  it('只给配不上的角色卡与聊天目录打标记', () => {
    const tree = sampleTree();
    annotateChatLinks(tree, '未匹配');
    const [foo, bar] = tree[0].children;
    const [fooDir, bazDir] = tree[1].children;
    expect(foo.note).toBeUndefined();
    expect(bar.note).toBe('未匹配');
    expect(fooDir.note).toBeUndefined();
    expect(bazDir.note).toBe('未匹配');
  });

  it('已有 note 的节点不被覆盖', () => {
    const tree = sampleTree();
    tree[0].children[1].note = '自定义';
    annotateChatLinks(tree, '未匹配');
    expect(tree[0].children[1].note).toBe('自定义');
  });
});
