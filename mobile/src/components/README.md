# 公共组件库使用说明

组件统一放在 `src/components` 目录下，基于 `unplugin-vue-components` 自动按需注册，页面中直接使用标签即可，无需手动 `import`。

所有组件均以 `Base` 前缀命名，例如 `<base-button />`。

## 组件清单

| 组件 | 作用 |
|------|------|
| BaseButton | 按钮与防抖点击 |
| BaseEmpty | 空状态 |
| BaseLoading | 加载态 |
| BaseModal | 弹窗 |
| BaseTag | 标签 |
| BaseImage | 图片 |
| BaseCard | 卡片 |
| BaseScroll | BetterScroll 容器 |
| BaseSwiper | 轮播 |
| BaseTabs | 标签页 |
| SelfForm | 自研表单 |
| SelfFormItem | 表单项 |
| SelfDrawer | 抽屉 |
| SelfUpload | 上传 |

---

## BaseButton 按钮

基于 Vant Button 封装，增加防抖、loading 与禁用联动。

### Props

| 属性       | 类型      | 默认值    | 说明                       |
|------------|-----------|-----------|----------------------------|
| type       | string    | primary   | 同 Vant Button type        |
| size       | string    | normal    | 同 Vant Button size        |
| loading    | boolean   | false     | 加载状态，自动禁用点击     |
| disabled   | boolean   | false     | 禁用状态                   |
| block      | boolean   | false     | 块级按钮                   |
| round      | boolean   | true      | 圆角                       |
| plain      | boolean   | false     | 朴素按钮                   |
| color      | string    | ''        | 自定义颜色                 |
| debounce   | number    | 0         | 防抖间隔，单位 ms          |

### Events

| 事件   | 说明         |
|--------|--------------|
| click  | 点击事件     |

### 示例

```vue
<base-button type="primary" block @click="submit">
  提交
</base-button>

<base-button :debounce="500" @click="handleClick">
  防抖按钮
</base-button>
```

---

## BaseEmpty 空状态

用于列表无数据、页面异常等场景。

### Props

| 属性         | 类型              | 默认值       | 说明                  |
|--------------|-------------------|--------------|-----------------------|
| image        | string            | ''           | 自定义图片地址        |
| imageSize    | string / number   | 120          | 图片尺寸              |
| icon         | string            | warning-o    | Vant 图标名称         |
| iconSize     | string / number   | 64           | 图标大小              |
| iconColor    | string            | #c9cdd4      | 图标颜色              |
| description  | string            | 暂无数据     | 描述文字              |
| showButton   | boolean           | false        | 是否显示操作按钮      |
| buttonText   | string            | 重新加载     | 按钮文字              |

### Events

| 事件   | 说明             |
|--------|------------------|
| click  | 点击按钮事件     |

### 示例

```vue
<base-empty
  icon="warning-o"
  description="暂无订单"
  :show-button="true"
  button-text="去逛逛"
  @click="goHome"
/>
```

---

## BaseLoading 加载

支持局部加载与全屏遮罩。

### Props

| 属性    | 类型              | 默认值       | 说明                  |
|---------|-------------------|--------------|-----------------------|
| visible | boolean           | false        | 是否显示              |
| text    | string            | 加载中...    | 提示文字              |
| type    | string            | circular     | 加载图标类型          |
| size    | string / number   | 24           | 图标大小              |
| textSize| string / number   | 14           | 文字大小              |
| color   | string            | #0ea5e9      | 图标颜色              |
| fixed   | boolean           | false        | 是否全屏固定定位      |

### 示例

```vue
<!-- 局部 -->
<base-loading :visible="loading" text="正在加载..." />

<!-- 全屏 -->
<base-loading :visible="visible" fixed text="请稍候" />
```

---

## BaseModal 弹窗

基于 Vant Popup，统一确认/取消操作。

### Props

| 属性                 | 类型              | 默认值   | 说明                       |
|----------------------|-------------------|----------|----------------------------|
| modelValue           | boolean           | false    | 是否显示                   |
| title                | string            | ''       | 标题                       |
| width                | string / number   | 80%      | 宽度                       |
| maxWidth             | string / number   | 320      | 最大宽度                   |
| round                | boolean           | true     | 圆角                       |
| position             | string            | center   | 弹出位置                   |
| closeable            | boolean           | false    | 是否显示关闭图标           |
| closeOnClickOverlay  | boolean           | true     | 点击遮罩关闭               |
| showFooter           | boolean           | true     | 是否显示底部按钮           |
| showCancel           | boolean           | true     | 是否显示取消按钮           |
| cancelText           | string            | 取消     | 取消按钮文字               |
| confirmText          | string            | 确认     | 确认按钮文字               |
| confirmLoading       | boolean           | false    | 确认按钮 loading           |

### Events

| 事件                | 说明                     |
|---------------------|--------------------------|
| update:modelValue   | 双向绑定显示状态         |
| confirm             | 点击确认                 |
| cancel              | 点击取消                 |
| closed              | 动画结束关闭             |

### 示例

```vue
<base-modal v-model="visible" title="提示" @confirm="onConfirm">
  <p>弹窗内容</p>
</base-modal>
```

---

## BaseFormItem 表单项

基于 Vant Field 封装，统一输入框样式。

### Props

| 属性         | 类型              | 默认值     | 说明                  |
|--------------|-------------------|------------|-----------------------|
| modelValue   | string / number   | ''         | 绑定值                |
| label        | string            | ''         | 标签                  |
| placeholder  | string            | 请输入     | 占位符                |
| type         | string            | text       | 输入类型              |
| required     | boolean           | false      | 是否必填              |
| rules        | array             | []         | 校验规则              |
| readonly     | boolean           | false      | 只读                  |
| disabled     | boolean           | false      | 禁用                  |
| clearable    | boolean           | true       | 是否显示清除按钮      |
| maxlength    | string / number   | ''         | 最大长度              |
| rows         | string / number   | 1          | 行数                  |
| autosize     | boolean / object  | false      | 自适应高度            |
| labelAlign   | string            | left       | 标签对齐              |
| inputAlign   | string            | right      | 输入框对齐            |

### Events

| 事件                | 说明                     |
|---------------------|--------------------------|
| update:modelValue   | 输入事件                 |
| blur                | 失焦                     |
| focus               | 聚焦                     |

### Slots

| 插槽名    | 说明                       |
|-----------|----------------------------|
| leftIcon  | 左侧图标                   |
| rightIcon | 右侧图标                   |
| button    | 输入框尾部按钮             |

### 示例

```vue
<base-form-item
  v-model="form.name"
  label="用户名"
  placeholder="请输入用户名"
  :rules="[{ required: true, message: '请填写用户名' }]"
/>

<base-form-item v-model="form.phone" label="手机号" type="tel">
  <template #button>
    <base-button size="small">发送验证码</base-button>
  </template>
</base-form-item>
```

---

## BaseTag 标签

用于状态、标记、分类等场景。

### Props

| 属性       | 类型      | 默认值    | 说明                       |
|------------|-----------|-----------|----------------------------|
| type       | string    | primary   | 类型：primary / success / danger / warning / default |
| plain      | boolean   | false     | 是否空心                   |
| round      | boolean   | true      | 是否圆角                   |
| color      | string    | ''        | 自定义背景/边框色          |
| textColor  | string    | ''        | 自定义文字色               |

### 示例

```vue
<base-tag type="primary">标签</base-tag>
<base-tag type="success" plain>成功</base-tag>
<base-tag color="#7232dd" text-color="#7232dd">自定义</base-tag>
```

---

## BaseImage 图片

封装图片加载、等比占位、错误占位。

### Props

| 属性    | 类型              | 默认值   | 说明                  |
|---------|-------------------|----------|-----------------------|
| src     | string            | ''       | 图片地址              |
| alt     | string            | ''       | 替代文本              |
| width   | string / number   | ''       | 宽度                  |
| height  | string / number   | ''       | 高度                  |
| radius  | string / number   | 8        | 圆角                  |
| ratio   | string / number   | ''       | 宽高比，如 16/9       |

### 示例

```vue
<base-image src="https://xxx.jpg" width="100%" ratio="16/9" :radius="12" />
<base-image src="error.jpg" width="120" height="120" />
```

---

## BaseCard 卡片

通用卡片容器，支持标题、header/footer 插槽。

### Props

| 属性    | 类型      | 默认值   | 说明                  |
|---------|-----------|----------|-----------------------|
| title   | string    | ''       | 标题                  |
| icon    | boolean   | true     | 标题左侧是否显示色块  |
| shadow  | boolean   | true     | 是否显示阴影          |
| padding | boolean   | true     | 内容区是否留白        |

### Slots

| 插槽名    | 说明                       |
|-----------|----------------------------|
| default   | 内容                       |
| header    | 标题右侧自定义内容         |
| footer    | 底部                       |

### 示例

```vue
<base-card title="今日推荐">
  <p>卡片内容</p>
</base-card>

<base-card title="我的订单">
  <template #header>
    <span>查看全部</span>
  </template>
  <!-- 内容 -->
</base-card>
```

---

## BaseScroll 滚动容器

基于 BetterScroll 2.0 封装，支持纵向/横向滚动、下拉刷新、上拉加载、滚动条。

### Props

| 属性             | 类型                | 默认值       | 说明                                 |
|------------------|---------------------|--------------|--------------------------------------|
| direction        | string              | vertical     | 滚动方向：vertical / horizontal / free |
| click            | boolean             | true         | 是否派发点击事件                     |
| pullDownRefresh  | boolean / object    | false        | 是否开启下拉刷新                     |
| pullUpLoad       | boolean / object    | false        | 是否开启上拉加载                     |
| scrollbar        | boolean / object    | false        | 是否显示滚动条                       |
| probeType        | number              | 0            | 滚动监听精度                         |
| listenScroll     | boolean             | false        | 是否监听滚动位置                     |
| mouseWheel       | boolean / object    | false        | 是否启用鼠标滚轮                     |
| nestedScroll     | boolean / object    | false        | 是否启用嵌套滚动（用于 Tabs 等场景） |

### Events

| 事件         | 说明                     |
|--------------|--------------------------|
| scroll       | 滚动中                   |
| scrollStart  | 开始滚动                 |
| scrollEnd    | 滚动结束                 |
| pullingDown  | 下拉刷新触发             |
| pullingUp    | 上拉加载触发             |

### Slots

| 插槽名    | 说明                       |
|-----------|----------------------------|
| default   | 滚动内容                   |
| pullDown  | 下拉状态，参数 { status }  |
| pullUp    | 上拉状态，参数 { status }  |

### Methods

| 方法              | 说明                     |
|-------------------|--------------------------|
| refresh()         | 刷新滚动尺寸             |
| finishPullDown()  | 结束下拉刷新             |
| finishPullUp(hasMore) | 结束上拉加载，hasMore=false 表示无更多 |
| enablePullUp()    | 重新开启上拉加载         |
| scrollTo(x, y, time) | 滚动到指定位置       |

### 示例

```vue
<base-scroll
  ref="scrollRef"
  :pull-down-refresh="true"
  :pull-up-load="true"
  :scrollbar="true"
  @pulling-down="onRefresh"
  @pulling-up="onLoadMore"
>
  <van-cell v-for="item in list" :key="item.id" :title="item.title" />
</base-scroll>
```

---

## BaseSwiper 轮播

基于 BetterScroll 2.0 Slide 插件封装，支持循环、自动播放、分页点、自定义内容。

### Props

| 属性          | 类型      | 默认值   | 说明                  |
|---------------|-----------|----------|-----------------------|
| list          | array     | []       | 数据列表              |
| keyField      | string    | ''       | 唯一键字段名          |
| loop          | boolean   | true     | 是否循环              |
| autoplay      | boolean   | true     | 是否自动播放          |
| interval      | number    | 3000     | 自动播放间隔 ms       |
| showDots      | boolean   | true     | 是否显示分页点        |
| initialIndex  | number    | 0        | 初始索引              |
| speed         | number    | 400      | 切换速度 ms           |
| vertical      | boolean   | false    | 是否纵向轮播          |

### Events

| 事件   | 说明                     |
|--------|--------------------------|
| change | 当前页变化               |
| click  | 点击当前页               |

### Methods

| 方法              | 说明                     |
|-------------------|--------------------------|
| refresh()         | 刷新尺寸                 |
| goToPage(index)   | 跳转到指定页             |
| prev()            | 上一页                   |
| next()            | 下一页                   |

### 示例

```vue
<base-swiper :list="bannerList" :loop="true" :autoplay="true">
  <template #default="{ item, index }">
    <img :src="item.image" class="w-full h-full object-cover" />
  </template>
</base-swiper>
```

---

## BaseTabs 标签页

基于 BetterScroll 2.0 Slide + nested-scroll 封装，支持点击/左右滑动切换 Tab，内部垂直滚动与横向切换手势互不冲突。

### Props

| 属性        | 类型      | 默认值   | 说明                  |
|-------------|-----------|----------|-----------------------|
| tabs        | array     | []       | Tab 数据 { title, key?, content? } |
| modelValue  | number    | 0        | 当前激活索引          |
| speed       | number    | 300      | 切换动画时长 ms       |
| loop        | boolean   | false    | 是否循环切换          |
| swipeable   | boolean   | true     | 是否允许滑动切换      |

### Events

| 事件                | 说明                     |
|---------------------|--------------------------|
| update:modelValue   | 激活索引变化             |
| change              | 切换完成，参数 (index, tab) |

### Slots

| 插槽名             | 说明                                           |
|--------------------|------------------------------------------------|
| default            | 所有 Tab 默认内容，参数 { tab, index, active } |
| tab-${index}       | 单独定义第 index 个 Tab 的内容                 |

### Methods

| 方法              | 说明                     |
|-------------------|--------------------------|
| refresh()         | 刷新尺寸                 |
| switchTab(index)  | 切换到指定 Tab           |

### 示例

```vue
<base-tabs v-model="activeIndex" :tabs="tabs" @change="onChange">
  <template #default="{ tab, index, active }">
    <base-scroll v-if="active" nested-scroll>
      <div class="p-16">{{ tab.content }}</div>
    </base-scroll>
  </template>
</base-tabs>
```

### 手势冲突说明

- 外层 Tab 内容区使用 BetterScroll 横向 Slide，配置 `nestedScroll: true`
- 内部垂直滚动区域使用 `<base-scroll nested-scroll>`，同样开启 `nestedScroll`
- BetterScroll 的 `nested-scroll` 插件会自动判断手势方向，横向滑动切换 Tab，纵向滑动交给内部滚动
