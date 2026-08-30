import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { bandFor, BandTone, gapLabel, pipsFor } from '../engine/bands';
import { formatWithYear } from '../engine/dates';
import { curveLabel, curveName, detectGenre, Genre, GENRE_LABEL, GENRES, methodFor, PhysicalKind } from '../engine/genres';
import { badgeFor } from '../engine/plan';
import { Skill, Topic } from '../engine/types';
import { useStore } from '../store/store';
import { bandColor, bandColors } from '../theme/colors';
import { useTheme } from '../theme/theme';
import { TOUCH, radius } from '../theme/tokens';
import { Archive, Chevron, Pencil, Plus } from '../ui/icons';
import {
  Badge,
  Card,
  Chip,
  Disclose,
  Dot,
  Field,
  Label,
  Pips,
  Press,
  PrimaryButton,
  Row,
  Segmented,
  TextButton,
  Txt,
} from '../ui/primitives';
import { Screen, Sheet } from '../ui/shell';

export function SkillsScreen() {
  const t = useTheme();
  const store = useStore();
  const { doc } = store;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const skills = doc.skills.filter((s) => !s.archived_at);
  const archived = doc.skills.filter((s) => s.archived_at);
  const exam = doc.settings.exam_date;

  return (
    <Screen>
      <Row align="flex-start" gap={12} style={{ paddingTop: 12 }}>
        <View style={{ flex: 1 }}>
          <Txt v="screenTitle">Skills</Txt>
          <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 3 }}>
            {exam ? `Exams · ${formatWithYear(exam)}` : 'No exam date set'}
          </Txt>
        </View>
        <Press
          scale={0.94}
          onPress={() => setSheetOpen(true)}
          accessibilityLabel="Add a skill"
          style={[
            {
              width: TOUCH,
              height: TOUCH,
              borderRadius: radius.pill,
              backgroundColor: t.c.acc,
              alignItems: 'center',
              justifyContent: 'center',
            },
            t.glow,
          ]}
        >
          <Plus size={19} color={t.c.accFg} />
        </Press>
      </Row>

      <View style={{ marginTop: 20, gap: 12 }}>
        {skills.map((skill, i) => (
          <SkillCard
            key={skill.id}
            skill={skill}
            index={i}
            open={openId === skill.id}
            menuOpen={menuId === skill.id}
            renaming={renamingId === skill.id}
            draft={draft}
            setDraft={setDraft}
            onToggle={() => {
              setOpenId((p) => (p === skill.id ? null : skill.id));
              setMenuId(null);
            }}
            onMenu={() => setMenuId((p) => (p === skill.id ? null : skill.id))}
            onStartRename={() => {
              setRenamingId(skill.id);
              setDraft(skill.name);
              setMenuId(null);
            }}
            onCommitRename={() => {
              store.renameSkill(skill.id, draft || skill.name);
              setRenamingId(null);
            }}
            onCancelRename={() => setRenamingId(null)}
            onArchive={() => {
              store.archiveSkill(skill.id);
              setMenuId(null);
              setOpenId(null);
            }}
            onDelete={() => {
              setMenuId(null);
              setDeletingId(skill.id);
            }}
          />
        ))}
      </View>

      {!skills.length ? (
        <Card style={{ marginTop: 20 }}>
          <Txt v="rowTitle">No skills yet</Txt>
          <Txt v="secondary" c={t.c.mut} style={{ marginTop: 6, lineHeight: 19 }}>
            The name picks the genre, and the genre picks the algorithm and the practice method.
          </Txt>
          <PrimaryButton label="Add your first skill" onPress={() => setSheetOpen(true)} style={{ marginTop: 16 }} />
        </Card>
      ) : null}

      {archived.length ? (
        <>
          <Press
            onPress={() => setArchivedOpen((v) => !v)}
            accessibilityState={{ expanded: archivedOpen }}
            style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 }}
          >
            <Txt v="secondary" c={t.c.acc} style={{ fontWeight: '500' }}>
              {archivedOpen ? 'Hide' : 'Show'} {archived.length} archived
            </Txt>
            <Chevron open={archivedOpen} size={12} color={t.c.acc} />
          </Press>
          {archivedOpen ? (
            <Disclose>
              <Card padding={0} style={{ paddingHorizontal: 18 }}>
                {archived.map((s, i) => (
                  <Row key={s.id} gap={10} style={{ paddingVertical: 14, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.c.line }}>
                    <Dot color={t.hue(s.hue_index)} size={7} />
                    <Txt style={{ flex: 1, fontSize: 14 }} numberOfLines={1}>
                      {s.name}
                    </Txt>
                    <Press onPress={() => store.restoreSkill(s.id)} style={{ paddingVertical: 6 }}>
                      <Txt v="secondary" c={t.c.acc} style={{ fontWeight: '600' }}>
                        Restore
                      </Txt>
                    </Press>
                  </Row>
                ))}
              </Card>
            </Disclose>
          ) : null}
        </>
      ) : null}

      <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 14, textAlign: 'center' }}>
        Archiving keeps everything. Deleting a skill removes its topics and ratings for good.
      </Txt>

      <NewSkillSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
      <DeleteSkillSheet skillId={deletingId} onClose={() => setDeletingId(null)} />
    </Screen>
  );
}

/* ------------------------------------------------- delete confirmation */

/**
 * Deleting a skill takes its topics, their ratings and their history with it,
 * so the confirmation counts them out loud before it happens rather than
 * saying "are you sure". It also offers Archive, because in almost every case
 * that is what was actually wanted — the screen's own footer has always
 * promised archived work is kept, and this is the one place that promise is
 * about to be broken on purpose.
 */
function DeleteSkillSheet({ skillId, onClose }: { skillId: string | null; onClose: () => void }) {
  const t = useTheme();
  const store = useStore();
  const skill = store.doc.skills.find((s) => s.id === skillId);
  const [busy, setBusy] = useState(false);

  if (!skill) return <Sheet open={false} onClose={onClose}><View /></Sheet>;

  const { topics, ratings, logs } = store.skillFootprint(skill.id);
  const counts = [
    `${topics} ${topics === 1 ? 'topic' : 'topics'}`,
    `${ratings} ${ratings === 1 ? 'rating' : 'ratings'}`,
    `${logs} ${logs === 1 ? 'logged session' : 'logged sessions'}`,
  ];

  return (
    <Sheet open onClose={onClose}>
      <Txt v="sheetTitle">Delete {skill.name}?</Txt>
      <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 4, lineHeight: 19 }}>
        This cannot be undone, and it is not what Archive does.
      </Txt>

      <View style={{ marginTop: 16, borderRadius: radius.button, padding: 16, backgroundColor: t.c.redT }}>
        <Txt v="label" c={t.c.red}>
          Deleted with it
        </Txt>
        {counts.map((line) => (
          <Txt key={line} c={t.c.red} style={{ marginTop: 6, fontSize: 15 }}>
            {line}
          </Txt>
        ))}
      </View>

      <Txt v="secondary" c={t.c.mut} style={{ marginTop: 14, lineHeight: 19 }}>
        Archiving keeps all of it and takes the skill off your list, which is usually what you want. Export from
        Settings first if you are unsure.
      </Txt>

      <PrimaryButton
        label="Archive instead"
        tone="surface"
        style={{ marginTop: 18 }}
        onPress={() => {
          store.archiveSkill(skill.id);
          onClose();
        }}
      />
      <PrimaryButton
        label={busy ? 'Deleting…' : `Delete ${skill.name}`}
        tone="danger"
        disabled={busy}
        style={{ marginTop: 9 }}
        onPress={() => {
          setBusy(true);
          store
            .deleteSkill(skill.id)
            .catch(() => undefined)
            .finally(() => {
              setBusy(false);
              onClose();
            });
        }}
      />
      <TextButton label="Keep it" onPress={onClose} />
    </Sheet>
  );
}

/* ------------------------------------------------------------ skill card */

/**
 * A skill reads as weak as its weakest live topic, and takes that topic's band
 * — label and tone together. Naming the band here rather than inventing a
 * parallel vocabulary is what keeps a card that says "Fragile" the same colour
 * as the topic on Today that made it fragile.
 */
function stateOf(topics: Topic[]): { label: string; tone: BandTone | 'fnt' } {
  if (!topics.length) return { label: 'New', tone: 'acc' };
  if (topics.every((x) => x.state === 'paused')) return { label: 'Paused', tone: 'fnt' };
  const live = topics.filter((x) => x.state !== 'paused');
  const weakest = live.reduce((a, b) => (a.interval_days <= b.interval_days ? a : b));
  const band = bandFor(weakest.interval_days);
  return band.level >= 4 ? { label: 'Stable', tone: band.tone } : { label: band.label, tone: band.tone };
}

function SkillCard({
  skill,
  index,
  open,
  menuOpen,
  renaming,
  draft,
  setDraft,
  onToggle,
  onMenu,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onArchive,
  onDelete,
}: {
  skill: Skill;
  index: number;
  open: boolean;
  menuOpen: boolean;
  renaming: boolean;
  draft: string;
  setDraft: (v: string) => void;
  onToggle: () => void;
  onMenu: () => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const t = useTheme();
  const store = useStore();
  const topics = store.doc.topics.filter((x) => !x.archived_at && x.skill_id === skill.id);
  const state = stateOf(topics);
  const tone = bandColors(state.tone, t.c);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [topicDraft, setTopicDraft] = useState('');

  return (
    <View>
      <Card style={{ position: 'relative' }}>
        {renaming ? (
          <Disclose>
            <Row gap={8}>
              <View style={{ flex: 1 }}>
                <Field value={draft} onChangeText={setDraft} placeholder={skill.name} />
              </View>
              <Press
                onPress={onCommitRename}
                style={{ minHeight: 42, paddingHorizontal: 14, borderRadius: 10, backgroundColor: t.c.acc, justifyContent: 'center' }}
              >
                <Txt v="secondary" c={t.c.accFg} style={{ fontWeight: '600' }}>
                  Save
                </Txt>
              </Press>
              <TextButton label="Cancel" onPress={onCancelRename} style={{ paddingHorizontal: 4 }} />
            </Row>
          </Disclose>
        ) : (
          <Row gap={9}>
            <Dot color={t.hue(skill.hue_index)} />
            <Txt v="cardTitle" style={{ flex: 1 }} numberOfLines={1}>
              {skill.name}
            </Txt>
            <Badge text={badgeFor(skill)} />
            <Press
              onPress={onMenu}
              accessibilityLabel={`More for ${skill.name}`}
              style={{ width: 30, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 2.5 }}
            >
              <Dot color={t.c.fnt} size={3.5} />
              <Dot color={t.c.fnt} size={3.5} />
              <Dot color={t.c.fnt} size={3.5} />
            </Press>
          </Row>
        )}

        {menuOpen ? (
          <Disclose
            style={{
              position: 'absolute',
              top: 44,
              right: 16,
              zIndex: 30,
              minWidth: 170,
              borderRadius: radius.input,
              padding: 5,
              backgroundColor: t.c.surf,
              ...t.shadow,
            }}
          >
            <Press
              scale={1}
              onPress={onStartRename}
              style={{ minHeight: 40, borderRadius: 9, paddingHorizontal: 12, justifyContent: 'center' }}
            >
              <Txt style={{ fontSize: 14 }}>Rename</Txt>
            </Press>
            <Press
              scale={1}
              onPress={onArchive}
              style={{ minHeight: 40, borderRadius: 9, paddingHorizontal: 12, justifyContent: 'center' }}
            >
              <Txt style={{ fontSize: 14 }}>Archive skill</Txt>
            </Press>
            <Press
              scale={1}
              onPress={onDelete}
              style={{ minHeight: 40, borderRadius: 9, paddingHorizontal: 12, justifyContent: 'center' }}
            >
              <Txt style={{ fontSize: 14 }} c={t.c.red}>
                Delete skill
              </Txt>
            </Press>
          </Disclose>
        ) : null}

        <Txt v="secondary" c={t.c.mut} style={{ marginTop: 9, lineHeight: 19 }}>
          {methodFor(skill.genre, skill.physical_kind)}
        </Txt>

        <Press
          scale={1}
          onPress={onToggle}
          accessibilityState={{ expanded: open }}
          style={{
            marginTop: 12,
            paddingTop: 12,
            paddingBottom: 14,
            borderTopWidth: 1,
            borderTopColor: t.c.line,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Txt v="secondary" c={t.c.fnt}>
            {topics.length} {topics.length === 1 ? 'topic' : 'topics'}
          </Txt>
          <Dot color={t.c.line} size={3} />
          <Txt v="secondary" c={t.c.fnt} style={{ flex: 1 }} numberOfLines={1}>
            {curveName(skill.genre)}
          </Txt>
          <Badge text={state.label} fg={tone.fg} bg={tone.bg} />
          <Chevron open={open} color={t.c.fnt} />
        </Press>

        {open ? (
          <Disclose>
            {topics.map((topic) => {
              const band = bandFor(topic.interval_days);
              const color = bandColor(band, t.c);
              const editing = editingId === topic.id;
              return (
                <View key={topic.id} style={{ paddingVertical: 11, borderTopWidth: 1, borderTopColor: t.c.line }}>
                  {editing ? (
                    <Disclose>
                      <Row gap={8}>
                        <View style={{ flex: 1 }}>
                          <Field value={topicDraft} onChangeText={setTopicDraft} placeholder={topic.title} />
                        </View>
                        <Press
                          onPress={() => {
                            store.editTopic(topic.id, topicDraft || topic.title);
                            setEditingId(null);
                          }}
                          style={{ minHeight: 40, paddingHorizontal: 13, borderRadius: 10, backgroundColor: t.c.acc, justifyContent: 'center' }}
                        >
                          <Txt v="secondary" c={t.c.accFg} style={{ fontWeight: '600' }}>
                            Save
                          </Txt>
                        </Press>
                        <TextButton label="Cancel" onPress={() => setEditingId(null)} style={{ paddingHorizontal: 2 }} />
                      </Row>
                    </Disclose>
                  ) : (
                    <Row gap={10}>
                      <View style={{ flex: 1 }}>
                        <Txt style={{ fontSize: 14 }} numberOfLines={1}>
                          {topic.title}
                        </Txt>
                        <Row gap={7} style={{ marginTop: 5 }}>
                          <Pips pips={pipsFor(band)} color={color} />
                          <Txt v="label" c={color} style={{ textTransform: 'none', letterSpacing: 0 }}>
                            {band.label}
                          </Txt>
                          <Txt v="label" c={t.c.fnt} style={{ textTransform: 'none', letterSpacing: 0, fontWeight: '400' }}>
                            {gapLabel(topic.interval_days)}
                          </Txt>
                        </Row>
                      </View>
                      <Press
                        onPress={() => {
                          setEditingId(topic.id);
                          setTopicDraft(topic.title);
                        }}
                        accessibilityLabel={`Rename ${topic.title}`}
                        style={{ width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: t.c.sunk }}
                      >
                        <Pencil color={t.c.mut} />
                      </Press>
                      <Press
                        onPress={() => store.archiveTopic(topic.id)}
                        accessibilityLabel={`Archive ${topic.title}`}
                        style={{ width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: t.c.redT }}
                      >
                        <Archive color={t.c.red} />
                      </Press>
                    </Row>
                  )}
                </View>
              );
            })}
            {!topics.length ? (
              <View style={{ paddingVertical: 14, borderTopWidth: 1, borderTopColor: t.c.line }}>
                <Txt v="secondary" c={t.c.fnt} style={{ lineHeight: 19 }}>
                  No topics yet. Log one and it appears here.
                </Txt>
              </View>
            ) : null}
          </Disclose>
        ) : null}
      </Card>
    </View>
  );
}

/* ------------------------------------------------------- new skill sheet */

export function NewSkillSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTheme();
  const store = useStore();
  const [name, setName] = useState('');
  const [override, setOverride] = useState<Genre | null>(null);
  const [kind, setKind] = useState<PhysicalKind>('closed');

  const detection = useMemo(() => detectGenre(name), [name]);
  const genre = override ?? detection.genre;
  const confidence = override ? 'Set by you' : detection.confidence;
  const guessed = confidence === 'Guessed';

  const reset = () => {
    setName('');
    setOverride(null);
    setKind('closed');
  };

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
    >
      <Txt v="sheetTitle">New skill</Txt>
      <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 4, lineHeight: 19 }}>
        The name picks the genre, and the genre picks the algorithm.
      </Txt>

      <View style={{ marginTop: 16 }}>
        <Field value={name} onChangeText={setName} placeholder="Physics HL" />
      </View>

      <View style={{ marginTop: 16, borderRadius: radius.button, padding: 16, backgroundColor: t.c.sunk }}>
        <Row gap={8}>
          <Label>Detected genre</Label>
          <View style={{ flex: 1 }} />
          <Badge
            text={confidence}
            fg={guessed ? t.c.amb : t.c.acc}
            bg={guessed ? t.c.ambT : t.c.accT}
          />
        </Row>
        <Txt c={t.c.acc} style={{ marginTop: 8, fontSize: 17, fontWeight: '600', letterSpacing: -0.19 }}>
          {genre === 'physical' ? `Physical (${kind})` : GENRE_LABEL[genre]}
        </Txt>
        <Txt v="secondary" c={t.c.mut} style={{ marginTop: 6, lineHeight: 19 }}>
          {methodFor(genre, kind)}
        </Txt>
        <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 8 }}>
          {curveLabel(genre)}
        </Txt>
      </View>

      {genre === 'physical' ? (
        <Disclose style={{ marginTop: 16 }}>
          <Label>Closed or open?</Label>
          <View style={{ marginTop: 8 }}>
            <Segmented
              value={kind}
              onChange={setKind}
              options={[
                { key: 'closed', label: 'Closed' },
                { key: 'open', label: 'Open' },
              ]}
            />
          </View>
          <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 7, lineHeight: 19 }}>
            {kind === 'closed' ? 'Two blocked sessions, then randomised.' : 'Variable and reactive from day one.'}
          </Txt>
        </Disclose>
      ) : null}

      <View style={{ marginTop: 16 }}>
        <Label>Or set it yourself</Label>
        <Row gap={7} style={{ marginTop: 8, flexWrap: 'wrap' }}>
          {GENRES.map((g) => (
            <Chip
              key={g}
              label={GENRE_LABEL[g]}
              selected={genre === g}
              onPress={() => setOverride(g)}
              style={{ minHeight: 34 }}
            />
          ))}
        </Row>
      </View>

      <PrimaryButton
        label={name.trim() ? `Add ${name.trim()}` : 'Add skill'}
        disabled={!name.trim()}
        style={{ marginTop: 20 }}
        onPress={() => {
          store.createSkill({ name, genre, physical_kind: genre === 'physical' ? kind : null });
          reset();
          onClose();
        }}
      />
      <TextButton
        label="Cancel"
        style={{ marginTop: 6 }}
        onPress={() => {
          reset();
          onClose();
        }}
      />
    </Sheet>
  );
}
