import type {
  chapterStatus,
  storyStatus,
  storyVisibility,
  tagKind,
  userRole,
  userStatus,
} from '../schema/enums';

/** Dữ liệu mẫu cho máy dev. Nội dung tự viết, không lấy từ truyện có thật. */

type EnumValue<E extends { enumValues: readonly string[] }> = E['enumValues'][number];

export interface TagFixture {
  slug: string;
  name: string;
  kind: EnumValue<typeof tagKind>;
  /** Tag trùng: trỏ về tag chuẩn. */
  canonicalSlug?: string;
}

export interface UserFixture {
  username: string;
  displayName: string;
  email: string;
  role: EnumValue<typeof userRole>;
  status: EnumValue<typeof userStatus>;
  bio?: string;
}

export interface ChapterFixture {
  title: string;
  status: Extract<EnumValue<typeof chapterStatus>, 'draft' | 'scheduled' | 'published'>;
  paragraphs: string[];
  authorNote?: string;
}

export interface StoryFixture {
  title: string;
  synopsis: string;
  authorUsername: string;
  mainTagSlug: string;
  /** Các tag phụ (không gồm tag chính). */
  tagSlugs: string[];
  status: EnumValue<typeof storyStatus>;
  visibility: EnumValue<typeof storyVisibility>;
  isMature: boolean;
  isAiAssisted: boolean;
  chapters: ChapterFixture[];
}

export const TAGS: TagFixture[] = [
  { slug: 'tien-hiep', name: 'Tiên hiệp', kind: 'genre' },
  { slug: 'huyen-huyen', name: 'Huyền huyễn', kind: 'genre' },
  { slug: 'do-thi', name: 'Đô thị', kind: 'genre' },
  { slug: 'ngon-tinh', name: 'Ngôn tình', kind: 'genre' },
  { slug: 'kiem-hiep', name: 'Kiếm hiệp', kind: 'genre' },
  { slug: 'khoa-huyen', name: 'Khoa huyễn', kind: 'genre' },
  { slug: 'kinh-di', name: 'Kinh dị', kind: 'genre' },
  { slug: 'trinh-tham', name: 'Trinh thám', kind: 'genre' },
  { slug: 'xuyen-khong', name: 'Xuyên không', kind: 'theme' },
  { slug: 'he-thong', name: 'Hệ thống', kind: 'theme' },
  { slug: 'bao-luc', name: 'Bạo lực', kind: 'warning' },
  { slug: 'noi-dung-18', name: 'Nội dung 18+', kind: 'warning' },
  { slug: 'tu-tien', name: 'Tu tiên', kind: 'genre', canonicalSlug: 'tien-hiep' },
];

export const USERS: UserFixture[] = [
  {
    username: 'admin',
    displayName: 'Quản trị viên',
    email: 'admin@novelhub.local',
    role: 'admin',
    status: 'active',
  },
  {
    username: 'kiem_duyet',
    displayName: 'Người kiểm duyệt',
    email: 'mod@novelhub.local',
    role: 'mod',
    status: 'active',
  },
  {
    username: 'tac_gia_mau',
    displayName: 'Mộc Lan Thư',
    email: 'author@novelhub.local',
    role: 'author',
    status: 'active',
    bio: 'Viết truyện vào những đêm mất ngủ.',
  },
  {
    username: 'doc_gia_mau',
    displayName: 'Độc giả chăm chỉ',
    email: 'reader@novelhub.local',
    role: 'reader',
    status: 'active',
  },
  {
    username: 'bi_cam',
    displayName: 'Tài khoản bị cấm',
    email: 'banned@novelhub.local',
    role: 'reader',
    status: 'banned',
  },
];

const XIANXIA = [
  'Gió núi Thanh Vân thổi qua rừng trúc, mang theo hơi lạnh của tuyết vừa tan. Lâm Phong ngồi xếp bằng trên tảng đá xanh, hai tay đặt hờ trên đầu gối, cố dẫn luồng linh khí mỏng manh đi qua kinh mạch. Ba năm nay hắn vẫn dừng ở tầng thứ nhất Luyện Khí, trong khi những đệ tử nhập môn cùng lúc đã sớm bước vào tầng thứ ba, được trưởng lão để mắt tới.',
  'Trong tông môn, người ta gọi hắn là phế vật. Lâm Phong không cãi, cũng chẳng buồn giải thích. Mỗi sáng hắn vẫn gánh nước từ suối sau núi, quét sạch bậc đá dẫn lên đại điện, rồi tranh thủ lúc mọi người nghỉ trưa để luyện kiếm một mình. Thanh kiếm gỗ trong tay đã mòn nhẵn chuôi, nhưng mỗi đường kiếm hắn vung ra vẫn thẳng như ngày đầu.',
  'Đêm ấy trăng tròn treo trên đỉnh núi. Khi Lâm Phong vừa thu kiếm, một luồng sáng mờ từ dưới đáy giếng cạn bỗng lóe lên. Hắn cúi xuống nhìn, thấy một mảnh sắt gỉ nằm lẫn trong lớp rêu xanh. Ngón tay vừa chạm vào, cả người hắn như bị kéo vào một vùng tối mênh mông, nơi có tiếng ai đó thở dài rất khẽ, như đã chờ đợi từ hàng nghìn năm trước.',
  'Giọng nói ấy già nua mà trầm ổn, xưng là tàn hồn của một kiếm tu đã ngã xuống trong trận chiến cuối cùng của thời thượng cổ. Lão bảo rằng kinh mạch của Lâm Phong không hề tắc nghẽn, chỉ là quá rộng, rộng đến mức linh khí thông thường đổ vào cũng như muối bỏ biển. Muốn tiến thêm một bước, hắn phải học cách nuốt kiếm ý thay vì linh khí.',
  'Những ngày sau đó, Lâm Phong vẫn sống như cũ trước mắt mọi người. Chỉ có điều mỗi đêm hắn lại trở về giếng cạn, đứng lặng hàng giờ trước mảnh sắt gỉ, cảm nhận từng tia kiếm ý lạnh buốt thấm qua da thịt. Đau đớn đến mức mồ hôi ướt sũng áo, nhưng hắn không lùi. Hắn hiểu rằng con đường này không có ai đi cùng, cũng không có ai dọn sẵn bậc thang.',
  'Đại hội tỷ thí của ngoại môn được định vào đầu tháng sau. Danh sách treo trước đại điện có tên Lâm Phong ở dòng cuối cùng, bên cạnh là một dấu gạch mực ai đó cố tình vẽ lên, như muốn nhắc rằng hắn chẳng đáng để ai ghi nhớ. Lâm Phong đứng nhìn rất lâu, rồi khẽ cười. Hắn quay về phòng, lau thanh kiếm gỗ thật sạch, và ngủ một giấc dài.',
];

const URBAN = [
  'Sài Gòn ba giờ sáng không ngủ hẳn, chỉ thiu thiu như một người mệt mỏi tựa đầu vào cửa kính xe buýt. Minh đứng dưới mái hiên của một tiệm tạp hóa đã đóng cửa, điếu thuốc trên tay cháy gần hết mà chưa hút hơi nào. Bên kia đường, ánh đèn vàng của quán cà phê vỉa hè vẫn sáng, vài người đàn ông ngồi im lặng, mỗi người ôm một nỗi riêng.',
  'Anh làm nghề chạy xe đêm đã gần mười năm. Thành phố này anh thuộc từng con hẻm, từng góc chợ, từng chiếc cầu nơi người ta hay dừng lại nhìn xuống dòng nước đen. Anh từng chở những vị khách say khướt cười suốt quãng đường, những cô gái khóc không thành tiếng, và cả những người lên xe mà không nói nổi một địa chỉ để về.',
  'Đêm nay khác. Từ lúc nhận cuốc xe ở bến Bạch Đằng, Minh đã thấy người đàn ông mặc áo khoác xám ngồi ở ghế sau có gì đó không ổn. Ông ta không nhìn điện thoại, không nhìn ra đường, chỉ nhìn chằm chằm vào gương chiếu hậu, như thể đang đợi ai đó xuất hiện phía sau. Mỗi lần xe dừng đèn đỏ, bàn tay ông ta lại siết chặt quai túi.',
  'Đến ngã tư thứ ba, một chiếc xe máy không biển số bám theo, giữ khoảng cách vừa đủ để không bị chú ý. Minh liếc gương, rồi lặng lẽ rẽ vào một con hẻm nhỏ mà anh biết có lối thoát ra đường lớn. Người đàn ông phía sau khẽ nói cảm ơn, giọng khàn đặc. Đó là câu đầu tiên ông ta nói kể từ khi lên xe.',
  'Khi trời bắt đầu hửng sáng, họ dừng lại trước một khu chung cư cũ ở quận Tư. Người khách trả tiền gấp ba lần giá cuốc, rồi để lại trên ghế một phong bì dán kín. Minh định gọi lại thì bóng áo khoác xám đã khuất sau cầu thang. Anh nhìn phong bì rất lâu, biết rằng từ giây phút này, cuộc đời mình sẽ không còn yên ổn như trước.',
  'Mẹ anh vẫn thường nói, ở thành phố này người ta không sợ bóng tối, người ta chỉ sợ những gì bóng tối mang theo khi trời sáng. Minh từng nghĩ đó chỉ là lời của người già. Giờ đây, ngồi một mình trong xe với phong bì đặt trên đùi, anh mới hiểu bà muốn dặn mình điều gì, và tiếc rằng mình đã hiểu ra quá muộn.',
];

const LIGHTHOUSE = [
  'Ngọn hải đăng trên mũi đá đã ngừng hoạt động từ lâu, nhưng ông Tư vẫn lên đó mỗi chiều. Ông lau kính, tra dầu cho bản lề cửa sắt, ghi vài dòng vào cuốn sổ bìa da đã sờn mép. Không ai trong làng biết ông viết gì. Người ta chỉ thấy đèn trên đỉnh tháp thỉnh thoảng lại sáng lên vào những đêm không trăng.',
  'Cuốn sổ được tìm thấy sau đám tang của ông, nằm trong hộp gỗ dưới gầm giường. Trang đầu tiên chỉ có một dòng chữ viết tay nghiêng nghiêng, ghi rằng đây là nhật ký của những con tàu không bao giờ cập bến. Những trang sau là ngày tháng, tọa độ, và tên của những người mà không ai trong làng từng nghe nói tới.',
];

/** Lặp lại đoạn văn mẫu theo vòng để mỗi chương có nội dung khác nhau một chút. */
function rotate(bank: string[], start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => bank[(start + i) % bank.length] ?? '');
}

export const STORIES: StoryFixture[] = [
  {
    title: 'Kiếm Đạo Độc Tôn',
    synopsis:
      'Một đệ tử ngoại môn bị coi là phế vật tình cờ nhặt được tàn hồn của kiếm tu thượng cổ, và bắt đầu con đường nuốt kiếm ý thay linh khí.',
    authorUsername: 'tac_gia_mau',
    mainTagSlug: 'tien-hiep',
    tagSlugs: ['he-thong'],
    status: 'ongoing',
    visibility: 'published',
    isMature: false,
    isAiAssisted: false,
    chapters: [
      { title: 'Phế vật núi Thanh Vân', status: 'published', paragraphs: rotate(XIANXIA, 0, 6) },
      {
        title: 'Mảnh sắt dưới giếng cạn',
        status: 'published',
        paragraphs: rotate(XIANXIA, 1, 6),
        authorNote: 'Cảm ơn mọi người đã đọc tới đây, chương sau sẽ có tỷ thí.',
      },
      { title: 'Kiếm ý lạnh buốt', status: 'published', paragraphs: rotate(XIANXIA, 2, 6) },
      { title: 'Đại hội ngoại môn', status: 'scheduled', paragraphs: rotate(XIANXIA, 3, 6) },
      { title: 'Bản nháp chưa đặt tên', status: 'draft', paragraphs: rotate(XIANXIA, 4, 2) },
    ],
  },
  {
    title: 'Đêm Trắng Ở Sài Gòn',
    synopsis:
      'Một tài xế chạy xe đêm nhận cuốc khách lạ, và chiếc phong bì bị bỏ quên kéo anh vào thế giới ngầm của thành phố.',
    authorUsername: 'tac_gia_mau',
    mainTagSlug: 'do-thi',
    tagSlugs: ['bao-luc', 'noi-dung-18'],
    status: 'ongoing',
    visibility: 'published',
    isMature: true,
    isAiAssisted: true,
    chapters: [
      { title: 'Cuốc xe ba giờ sáng', status: 'published', paragraphs: rotate(URBAN, 0, 6) },
      { title: 'Phong bì dán kín', status: 'published', paragraphs: rotate(URBAN, 2, 6) },
    ],
  },
  {
    title: 'Nhật Ký Người Gác Đèn',
    synopsis: 'Cuốn sổ của người gác hải đăng ghi tên những con tàu không bao giờ cập bến.',
    authorUsername: 'tac_gia_mau',
    mainTagSlug: 'trinh-tham',
    tagSlugs: [],
    status: 'ongoing',
    visibility: 'draft',
    isMature: false,
    isAiAssisted: false,
    chapters: [{ title: 'Ngọn hải đăng tắt', status: 'draft', paragraphs: LIGHTHOUSE }],
  },
];
